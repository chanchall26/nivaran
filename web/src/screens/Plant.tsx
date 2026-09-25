import { Sprout } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { hourLabel, istToday, longDate } from '../lib/ist'
import { loadReplay, type Loaded } from '../lib/live'
import { snapCityFor } from '../lib/place'
import { loadSummerDay } from '../lib/snapshot'
import { hedgeWhatIf, plantSites, shadeWhatIf, speciesFor, windbreakWhatIf, type Cover, type PlantKind, type PlantSite } from '../lib/plant'
import { climateOf, nightHours, plantingNow } from '../lib/risk'
import { DemoTag, ICON, Skel, Src } from '../ui/atoms'
import { DayStrip } from '../ui/DayStrip'
import { PointsMap, type MapMarker } from '../ui/PointsMap'
import { Sheet } from '../ui/Sheet'
import { PanelBox } from './panels'
import { pct, pointName } from './shared'

const KIND_COLOR: Record<PlantKind, string> = { trees: '#2E8B57', hedge: '#0CA3A3', both: '#6A4C93', windbreak: '#4A6FA5' }
/** Darker shades of the same colours for small text on white (AA contrast). */
const KIND_TEXT: Record<PlantKind, string> = { trees: '#236b44', hedge: '#06706f', both: '#5a3f80', windbreak: '#3a5a88' }

/** Satellite land cover per point for the pilot cities (data/cover, ESA WorldCover 2021). */
function useCover(pilot: string | null) {
  const [c, setC] = useState<{ pilot: string; cover: Record<string, Cover> } | null>(null)
  useEffect(() => {
    if (!pilot) return
    let off = false
    fetch(`/data/cover/${pilot}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { points?: Record<string, Cover> } | null) => !off && setC({ pilot, cover: d?.points ?? {} }))
      .catch(() => !off && setC({ pilot, cover: {} }))
    return () => {
      off = true
    }
  }, [pilot])
  return c?.pilot === pilot ? c.cover : undefined
}

/** Last summer's hottest day at this place (real archive data). */
function useHottest() {
  const { place } = useApp()
  const [r, setR] = useState<{ key: string; l: Loaded | null } | null>(null)
  const key = `${place.lat},${place.lon}`
  useEffect(() => {
    let off = false
    const snap = snapCityFor(place)
    loadReplay('summer', place.lat, place.lon)
      // offline: the hottest day saved in the app for the pilot cities
      .catch(() => (snap ? loadSummerDay(snap) : null))
      .then((l) => !off && setR({ key, l: l ?? null }))
      .catch(() => !off && setR({ key, l: null }))
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return r?.key === key ? { day: r.l?.data.days[0] ?? null, done: true } : { day: null, done: false }
}

function Chips({ site }: { site: PlantSite }) {
  const { t, f, lang } = useI18n()
  const chips: string[] = []
  if (site.kind === 'windbreak') chips.push(t.plant.chips.cold)
  else if (site.parts.heat >= 0.25 && site.peakHour != null) chips.push(f(t.plant.chips.hot, { time: hourLabel(site.peakHour, lang) }))
  if (site.busy) chips.push(t.plant.chips.busy)
  if (site.staying > 0) chips.push(f(t.plant.chips.people, { n: site.staying }))
  if (site.first) chips.push(t.plant.chips.noShade)
  if (site.cover) chips.push(f(t.plant.chips.trees, { n: Math.round(site.cover.trees50 * 100) }))
  if (site.hard) chips.push(t.plant.chips.hard)
  if (site.dusty) chips.push(t.plant.chips.dusty)
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c} className="chip !text-xs">
          <Src kind="estimated">{c}</Src>
        </span>
      ))}
    </div>
  )
}

function Parts({ site }: { site: PlantSite }) {
  const { t } = useI18n()
  return (
    <ul className="space-y-1">
      {(['heat', 'air', 'people'] as const).map((k) => (
        <li key={k} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-xs">
          <span>{t.plant.parts[k]}</span>
          <span className="h-2 overflow-hidden rounded-full bg-mist">
            <span className="block h-full rounded-full" style={{ width: pct(site.parts[k]), background: KIND_COLOR[site.kind] }} />
          </span>
          <span className="text-right tabular">{pct(site.parts[k])}</span>
        </li>
      ))}
    </ul>
  )
}

function Detail({ site, hottest }: { site: PlantSite; hottest: ReturnType<typeof useHottest> }) {
  const { t, f, lang } = useI18n()
  const { wx } = useApp()
  const k = site.kind
  const hot = hottest.day
  const shade = hot && (k === 'trees' || k === 'both') ? shadeWhatIf(hot, site.point.shadeNow) : null
  const today = wx?.data.days[0]
  const pm10s = today?.hours.map((h) => h.pm10).filter((x): x is number => x != null) ?? []
  const hedge = (k === 'hedge' || k === 'both') && pm10s.length ? hedgeWhatIf(pm10s.reduce((a, b) => a + b, 0) / pm10s.length) : null
  const night = today ? nightHours(today, wx?.data.days[1]) : []
  const wind =
    k === 'windbreak' && night.length
      ? windbreakWhatIf(Math.min(...night.map((h) => h.temp)), night.reduce((a, h) => a + h.wind, 0) / night.length)
      : null
  const when: (keyof typeof t.plant.whenItems)[] =
    k === 'trees' ? ['canopy', 'trees'] : k === 'hedge' ? ['hedge'] : k === 'both' ? ['canopy', 'hedge', 'trees'] : ['windbreak']
  return (
    <div className="space-y-5">
      <section>
        <h3 className="flex items-center gap-2 font-display text-lg font-bold" style={{ color: KIND_TEXT[k] }}>
          <Sprout className="size-5" {...ICON} aria-hidden /> {t.plant.kind[k]}
        </h3>
        <p className="mt-1">{t.plant.kindWhy[k]}</p>
        <p className="mt-1 text-sm text-muted">{f(t.plant.examples, { list: speciesFor(k).map((s) => t.plant.species[s]).join(', ') })}</p>
      </section>
      <section>
        <h4 className="mb-1.5 text-sm font-semibold text-muted">{t.plant.why}</h4>
        <Chips site={site} />
        <div className="mt-3">
          <Parts site={site} />
        </div>
        {site.first && <p className="mt-2 text-sm font-semibold">{t.plant.first}</p>}
        {site.cover && (
          <p className="mt-2 text-xs text-muted">
            {f(t.plant.evidence, {
              trees: Math.round(site.cover.trees50 * 100), built: Math.round(site.cover.built30 * 100), bare: Math.round(site.cover.bare50 * 100),
            })}
          </p>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-display text-lg font-bold">{t.plant.whatIf}</h4>
          <DemoTag label={t.src.estimated} />
        </div>
        {(k === 'trees' || k === 'both') &&
          (!hottest.done ? (
            <Skel className="h-24 w-full" />
          ) : shade && hot ? (
            <div className="rounded-lg border border-line p-3">
              <div className="font-semibold">{t.plant.shadeTitle}</div>
              <p className="text-sm">{f(t.plant.shadeLine, { lo: shade.lo, hi: shade.hi })}</p>
              <p className="mt-1 font-semibold">
                {f(t.plant.dangerHours, { date: longDate(hot.date, lang), before: shade.before, best: shade.best, worst: shade.worst })}
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted">{t.plant.before}</div>
                  <DayStrip day={hot} shift="day" nowHour={null} selected={null} onSelect={() => {}} height="h-10" hint={false} />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted">{t.plant.after}</div>
                  <DayStrip day={shade.middle} shift="day" nowHour={null} selected={null} onSelect={() => {}} height="h-10" hint={false} />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">
                {t.plant.shadeNote} {f(t.src.replay, { date: longDate(hot.date, lang) })}
              </p>
            </div>
          ) : null)}
        {hedge && (
          <div className="rounded-lg border border-line p-3">
            <div className="font-semibold">{t.plant.hedgeTitle}</div>
            {/* below "Satisfactory" dust (PM10 50) the numbers say nothing; give the effect instead */}
            <p className="text-sm">{hedge.now >= 50 ? f(t.plant.hedgeLine, { now: hedge.now, lo: hedge.lo, hi: hedge.hi }) : t.plant.hedgeClean}</p>
            <p className="mt-1 text-xs text-muted">{t.plant.hedgeNote}</p>
          </div>
        )}
        {wind && (
          <div className="rounded-lg border border-line p-3">
            <div className="font-semibold">{t.plant.windTitle}</div>
            <p className="text-sm">{wind.calm ? t.plant.windCalm : f(t.plant.windLine, { now: wind.now, after: wind.after })}</p>
          </div>
        )}
        <p className="font-semibold">{t.plant.streetNote}</p>
      </section>
      <section>
        <h4 className="mb-1.5 text-sm font-semibold text-muted">{t.plant.when}</h4>
        <ul className="space-y-1 text-sm">
          {when.map((w) => (
            <li key={w} className="rounded-lg border border-line px-3 py-2">
              {t.plant.whenItems[w]}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default function Plant() {
  const { t, f, lang } = useI18n()
  const { place, pts, wx, startDate } = useApp()
  const hottest = useHottest()
  const [sel, setSel] = useState<string | null>(null)
  const climate = climateOf(wx?.data.elevation, place.pilot)
  const month = Number((startDate || istToday()).slice(5, 7))
  const now = plantingNow(month, climate)
  const cover = useCover(place.pilot)
  const sites = useMemo(() => plantSites(pts.points ?? [], hottest.day, climate, cover), [pts.points, hottest.day, climate, cover])
  const markers = useMemo<MapMarker[]>(
    () =>
      sites.map((s) => ({
        id: s.point.id, lat: s.point.lat, lon: s.point.lon, color: KIND_COLOR[s.kind], size: 14 + Math.round(s.score * 0.32),
        label: `${pointName(s.point, lang)}: ${t.plant.kind[s.kind]}, ${f(t.plant.score, { n: s.score })}`,
      })),
    [sites, lang, t, f],
  )
  const site = sites.find((s) => s.point.id === sel)
  const kinds = [...new Set(sites.map((s) => s.kind))]
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[28px] font-bold">{t.plant.title}</h1>
      <p
        className="flex items-center gap-2 rounded-xl px-4 py-3 font-semibold text-white"
        style={{ background: climate === 'cold_desert' ? '#2f5bb8' : now ? '#157a45' : '#4f5363' }}
      >
        <Sprout className="size-5 shrink-0" {...ICON} aria-hidden />
        {climate === 'cold_desert' ? (now ? t.plant.seasonNow : t.plant.seasonCold) : now ? t.plant.seasonNow : t.plant.seasonPlains}
      </p>
      <p className="max-w-3xl text-muted">{t.plant.intro}</p>
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="relative h-[460px] overflow-hidden rounded-xl border border-line">
          <PointsMap center={place} markers={markers} selected={sel} onSelect={setSel} view="city" />
          <ul className="absolute top-3 left-3 flex flex-wrap gap-1.5 pr-3">
            {kinds.map((k) => (
              <li key={k} className="chip !py-1 shadow-sm">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} /> {t.plant.kind[k]}
              </li>
            ))}
          </ul>
        </div>
        <PanelBox
          title={t.plant.title}
          sub={t.plant.pick}
          right={<DemoTag label={t.src.estimated} />}
          className="xl:max-h-[460px] xl:overflow-y-auto"
        >
          {pts.status === 'loading' || !hottest.done ? (
            <Skel className="h-40 w-full" />
          ) : !sites.length ? (
            <p className="text-sm text-muted">{t.plant.none}</p>
          ) : (
            <ol className="divide-y divide-line">
              {sites.map((s) => (
                <li key={s.point.id}>
                  <button type="button" onClick={() => setSel(s.point.id)} className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-mist">
                    <span
                      aria-hidden
                      className="mt-1 shrink-0 rounded-full"
                      style={{ background: KIND_COLOR[s.kind], width: 10 + s.score / 8, height: 10 + s.score / 8 }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold">{pointName(s.point, lang)}</span>
                        <span className="text-sm font-semibold" style={{ color: KIND_TEXT[s.kind] }}>
                          {t.plant.kind[s.kind]}
                        </span>
                        <span className="ml-auto rounded-full bg-mist px-2 py-0.5 text-xs font-bold tabular">{f(t.plant.score, { n: s.score })}</span>
                      </span>
                      <span className="mt-1 block">
                        <Chips site={s} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </PanelBox>
      </div>
      {site && (
        <Sheet open onClose={() => setSel(null)} title={pointName(site.point, lang)}>
          <Detail site={site} hottest={hottest} />
        </Sheet>
      )}
    </div>
  )
}
