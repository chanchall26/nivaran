import { Flame, Sun, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useDay } from '../ctx'
import { useI18n } from '../i18n'
import { hourLabel, longDate } from '../lib/ist'
import { REPLAY_FACT } from '../lib/live'
import { AQI_COLOR, aqiCategory, conditionOf, heatLevel, inShift, LEVEL_COLOR, needsForDay, type Level, type Shift } from '../lib/risk'
import { taskStore } from '../lib/tasks'
import { AirPanel } from '../ui/AirPanel'
import { DemoTag, ICON, LevelBadge, RulesInfo, Skel, Src } from '../ui/atoms'
import { ConditionBanner, FiveDay, modeChips } from '../ui/Condition'
import { DayStrip } from '../ui/DayStrip'
import { PointsMap, type MapMarker } from '../ui/PointsMap'
import { BothSeasons, ShadeClockCard, ShadeClockPanel, useScene } from '../ui/ShadeClock'
import { Sheet } from '../ui/Sheet'
import { WhatIf } from '../ui/WhatIf'
import { ChecksPanel, FireParts, HistoryList, HoursPanel, NeedsCards, PanelBox, ProtectionLine, useLinkTo, WhoList } from './panels'
import { pointName, useCrews, useNowHour, useRows, useSentence, useTrend, type Row } from './shared'

export function DayTabs() {
  const { dayIdx, setDayIdx, wx } = useApp()
  const { t } = useI18n()
  const hasTomorrow = (wx?.data.days.length ?? 0) > 1
  return (
    <div role="tablist" className="inline-flex rounded-full border border-line bg-paper p-0.5">
      {([0, 1] as const).map((i) => (
        <button
          key={i}
          role="tab"
          type="button"
          aria-selected={dayIdx === i}
          disabled={i === 1 && !hasTomorrow}
          onClick={() => setDayIdx(i)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${dayIdx === i ? 'bg-ink text-white' : 'text-ink'} disabled:opacity-40`}
        >
          {i === 0 ? t.today.tabToday : t.today.tabTomorrow}
        </button>
      ))}
    </div>
  )
}

export function ShiftSwitch({ value, onChange, withAll = true }: { value: Shift | 'all'; onChange: (s: Shift | 'all') => void; withAll?: boolean }) {
  const { t } = useI18n()
  const opts: (Shift | 'all')[] = withAll ? ['all', 'day', 'night'] : ['day', 'night']
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={value === o} onClick={() => onChange(o)}>
          {o === 'all' ? t.today.allDay : o === 'day' ? t.today.shiftDay : t.today.shiftNight}
        </button>
      ))}
    </div>
  )
}

/** The condition of the day being shown (today or tomorrow). */
export function useCondition() {
  const { day, next } = useDay()
  return useMemo(() => (day ? conditionOf(day, next) : null), [day, next])
}

/** Row 1: the condition banner, "Today outside in {place}" and the 24-hour strip. */
export function TodayHero() {
  const { place, wx, wxStatus, dayIdx, replay, refresh } = useApp()
  const { day, next, modes } = useDay()
  const { t, f, lang } = useI18n()
  const info = useCondition()
  const sentence = useSentence()
  const trend = useTrend()
  const nowHour = useNowHour(dayIdx)
  const [shiftPick, setShift] = useState<Shift | 'all' | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const name = lang === 'hi' ? place.nameHi : place.name
  const title = f(dayIdx === 0 ? t.today.title : t.today.titleTomorrow, { place: name })
  // cold nights open on the night shift; the user's own pick wins
  const shift = shiftPick ?? (info?.cond === 'cold' ? 'night' : 'all')

  if (wxStatus === 'error' && !wx)
    return (
      <section className="panel p-5">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted">{t.picker.netErr}</p>
        <button type="button" className="btn btn-ink mt-3" onClick={refresh}>
          {t.app.tryAgain}
        </button>
      </section>
    )

  return (
    <div className="space-y-3">
      {day && info ? <ConditionBanner info={info} day={day} next={next} /> : <Skel className="h-28 w-full rounded-xl" />}
      <section className="panel p-4 sm:p-5" aria-busy={!day}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl leading-tight font-bold sm:text-[28px]">{title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <DayTabs />
            <RulesInfo />
          </div>
        </div>
        {!day ? (
          <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
            <div className="space-y-3">
              <Skel className="h-16 w-40" />
              <Skel className="h-7 w-32 rounded-full" />
              <Skel className="h-12 w-full" />
            </div>
            <Skel className="h-40 w-full" />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
            <div>
              {dayIdx === 0 && wx ? (
                <>
                  <div className="text-sm font-semibold text-muted">{t.today.feelsNow}</div>
                  <Src kind="live">
                    <span className="num text-[64px] font-bold">{Math.round(wx.data.current.feels)}°</span>
                  </Src>
                </>
              ) : (
                <div className="flex gap-6">
                  <div>
                    <div className="text-sm font-semibold text-muted">{t.today.feelsTop}</div>
                    <Src kind="live">
                      <span className="num text-5xl font-bold">{Math.round(day.fmax)}°</span>
                    </Src>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-muted">{t.today.feelsLow}</div>
                    <Src kind="live">
                      <span className="num text-5xl font-bold">{Math.round(day.fmin)}°</span>
                    </Src>
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {modeChips(modes, info?.cond ?? 'mild', t).map((m) => (
                  <span key={m.key} className="chip font-semibold" style={{ borderColor: m.color, boxShadow: `inset 0 0 0 1px ${m.color}` }}>
                    <span aria-hidden className="size-2 rounded-full" style={{ background: m.color }} />
                    {m.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[17px] leading-snug">{sentence(day, modes, dayIdx === 0 && nowHour != null ? nowHour : 0, next)}</p>
              {replay && wx?.data.replayDate && (
                <p className="mt-2 text-xs font-semibold text-muted">{f(t.src.replay, { date: longDate(wx.data.replayDate, lang) })}</p>
              )}
            </div>
            <div>
              <div className="mb-3">
                <ShiftSwitch value={shift} onChange={setShift} />
              </div>
              <DayStrip day={day} shift={shift} nowHour={nowHour} selected={sel} onSelect={(h) => setSel(sel === h ? null : h)} />
            </div>
          </div>
        )}
        {day && dayIdx === 0 && wx && wx.data.days.length > 2 && (
          <div className="mt-5 border-t border-line pt-4">
            <FiveDay days={wx.data.days.slice(1, 6)} trend={trend} />
          </div>
        )}
      </section>
    </div>
  )
}

/** Side card for a tapped map point. */
export function PointCard({ row, onClose }: { row: Row; onClose: () => void }) {
  const { t, f, lang } = useI18n()
  const { profile } = useApp()
  const crews = useCrews()
  const to = useLinkTo()
  const scene = useScene(row.point)
  const [clock, setClock] = useState(false)
  const [fireSaved, setFireSaved] = useState(false)
  const p = row.point
  return (
    <div className="panel relative max-h-[min(80dvh,560px)] overflow-y-auto p-4 shadow-lg">
      <button type="button" onClick={onClose} className="btn btn-ghost btn-sm absolute top-2 right-2 !px-2" aria-label={t.app.close}>
        <X className="size-5" {...ICON} aria-hidden />
      </button>
      <h3 className="pr-8 font-display text-lg font-bold">{pointName(p, lang)}</h3>
      {p.ward && <p className="text-sm text-muted">{lang === 'hi' ? p.wardHi || p.ward : p.ward}</p>}
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="font-semibold text-muted">{t.map.who}</dt>
          <dd>
            <ul>
              {crews(p).map((c) => (
                <li key={c}>
                  <Src kind="estimated">{c}</Src>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-muted">{t.map.risk}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <LevelBadge level={row.risk.level} size="sm" />
            <span className="font-semibold">{f(t.who.debt, { n: row.debt })}</span>
          </dd>
        </div>
        {row.protection.items.length > 0 && (
          <div>
            <dd>
              <ProtectionLine row={row} />
            </dd>
          </div>
        )}
        {row.risk.burning && (
          <div>
            <dt className="font-semibold text-muted">{t.fire.title}</dt>
            <dd>
              <FireParts b={row.risk.burning} />
            </dd>
          </div>
        )}
        {row.heater && (
          <div>
            <dt className="font-semibold text-muted">{t.nav.checks}</dt>
            <dd>{t.map.heater[row.heater]}</dd>
          </div>
        )}
        <HistoryList pointId={p.id} />
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{t.topNeed[row.need]}</span>
        {profile?.role === 'officer' && row.need !== 'none' && (
          <Link to={to('/schemes', { point: p.id })} className="btn btn-ink btn-sm ml-auto">
            {t.who.planHelp}
          </Link>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {scene && (
          <button type="button" className="btn btn-line btn-sm" onClick={() => setClock(true)}>
            <Sun className="size-4" {...ICON} aria-hidden /> {t.map.shadeClock}
          </button>
        )}
        {profile?.role !== 'worker' && row.risk.burning && (
          <button
            type="button"
            className="btn btn-line btn-sm"
            onClick={() => {
              taskStore.reportFire(p.id)
              setFireSaved(true)
            }}
          >
            <Flame className="size-4" {...ICON} aria-hidden /> {t.fire.report}
          </button>
        )}
      </div>
      {fireSaved && (
        <p className="mt-2 text-sm font-semibold" role="status">
          {t.fire.reported}
        </p>
      )}
      {scene && (
        <Sheet open={clock} onClose={() => setClock(false)} title={`${t.shade.title}: ${pointName(p, lang)}`}>
          <ShadeClockCard point={p} />
        </Sheet>
      )}
    </div>
  )
}

type Layer = 'danger' | 'heat' | 'air' | 'fire'

export function MapWithCard({ rows, height = 'h-[420px]' }: { rows: Row[]; height?: string }) {
  const { place, pts } = useApp()
  const { t, f, lang } = useI18n()
  const info = useCondition()
  const [view, setView] = useState<'near' | 'city'>('city')
  const [sel, setSel] = useState<string | null>(null)
  const [layerPick, setLayer] = useState<Layer | null>(null)
  const { day } = useDay()
  const anyFire = rows.some((r) => r.risk.burning && r.risk.burning.level !== 'low')
  const cond = info?.cond
  // the map opens on the layer the day is about; the user's pick wins
  const layers: Layer[] = [
    'danger',
    ...((info?.hz.heat ?? 0) >= 1 ? (['heat'] as const) : []),
    ...((info?.hz.air ?? 0) >= 1 ? (['air'] as const) : []),
    ...(anyFire ? (['fire'] as const) : []),
  ]
  const auto: Layer =
    cond === 'cold' && anyFire ? 'fire' : cond === 'warm' || cond === 'hot' || cond === 'double' ? 'heat' : cond === 'air' ? 'air' : 'danger'
  const layer: Layer = layerPick && layers.includes(layerPick) ? layerPick : layers.includes(auto) ? auto : 'danger'
  const markers = useMemo<MapMarker[]>(
    () =>
      rows.map((r) => {
        const b = r.risk.burning
        const name = pointName(r.point, lang)
        if (layer === 'fire') {
          const c = !b ? '#c3cbd1' : b.level === 'high' ? '#D7263D' : b.level === 'medium' ? '#F07F13' : '#9aa6ae'
          return {
            id: r.point.id, lat: r.point.lat, lon: r.point.lon, color: c, size: b ? 14 + Math.round((b.score / 100) * 22) : 12,
            label: `${name}: ${b ? f(t.fire.score, { level: t.who.fireLevel[b.level], score: b.score }) : t.who.fireLevel.low}`,
          }
        }
        if (layer === 'heat' && day) {
          // the worst heat in the hours this point's people are out; size = people out in the day
          const lvl = Math.max(0, ...r.point.people.flatMap((c) => day.hours.filter((h) => inShift(h.hour, c.shift)).map((h) => heatLevel(h.feels)))) as Level
          const dayPeople = r.point.people.filter((c) => c.shift === 'day').reduce((a, c) => a + c.count, 0)
          return {
            id: r.point.id, lat: r.point.lat, lon: r.point.lon, color: LEVEL_COLOR[lvl], size: 14 + Math.min(24, Math.round(Math.sqrt(dayPeople) * 3)),
            label: `${name}: ${t.layer.heat}, ${t.level[lvl]}`,
          }
        }
        if (layer === 'air' && day) {
          // one city-wide air reading; the busy roads are where smoke and dust are worst
          const cat = day.aqi != null ? aqiCategory(day.aqi) : 0
          return {
            id: r.point.id, lat: r.point.lat, lon: r.point.lon, color: AQI_COLOR[cat],
            size: r.point.traffic === 'busy' ? 30 : r.point.traffic === 'some' ? 22 : 16,
            label: `${name}: ${t.layer.air}, ${t.aqi[cat]}${r.point.traffic === 'busy' ? `, ${t.plant.chips.busy}` : ''}`,
            badge: b?.level === 'high' ? 'fire-high' : b?.level === 'medium' ? 'fire-medium' : null,
          }
        }
        return {
          id: r.point.id, lat: r.point.lat, lon: r.point.lon, color: LEVEL_COLOR[r.risk.level],
          label: `${name}: ${t.level[r.risk.level]}${b && b.level !== 'low' ? `, ${f(t.who.fire, { level: t.who.fireLevel[b.level] })}` : ''}`,
          badge: b?.level === 'high' ? 'fire-high' : b?.level === 'medium' ? 'fire-medium' : null,
        }
      }),
    [rows, layer, lang, t, f, day],
  )
  const selRow = rows.find((r) => r.point.id === sel)
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line ${height}`}>
      <PointsMap center={place} markers={markers} selected={sel} onSelect={setSel} view={view} />
      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 pr-3">
        <button type="button" className="chip !py-1 shadow-sm" aria-pressed={view === 'near'} onClick={() => setView('near')}>
          {t.map.nearMe}
        </button>
        <button type="button" className="chip !py-1 shadow-sm" aria-pressed={view === 'city'} onClick={() => setView('city')}>
          {t.map.wholeCity}
        </button>
        {layers.length > 1 &&
          layers.map((l) => (
            <button key={l} type="button" className="chip !py-1 shadow-sm" aria-pressed={layer === l} onClick={() => setLayer(l)}>
              {l === 'fire' && <Flame className="size-3.5" {...ICON} aria-hidden />} {t.layer[l]}
            </button>
          ))}
      </div>
      {pts.status === 'loading' && <div className="absolute top-14 left-3 rounded-lg bg-paper px-3 py-1.5 text-sm shadow">{t.map.loading}</div>}
      {pts.status === 'error' && <div className="absolute top-14 left-3 rounded-lg bg-paper px-3 py-1.5 text-sm shadow">{t.map.err}</div>}
      {layer === 'fire' && (
        <div className="absolute bottom-2 left-2 max-w-[70%] rounded-md bg-paper/95 px-2 py-1 text-xs">
          <b>{t.fire.title}</b> · {t.fire.note}
        </div>
      )}
      {(layer === 'air' || layer === 'heat') && (
        <div className="absolute bottom-2 left-2 max-w-[70%] rounded-md bg-paper/95 px-2 py-1 text-xs">{layer === 'air' ? t.map.airSize : t.map.heatSize}</div>
      )}
      {pts.kind === 'osm' && pts.status === 'ok' && layer === 'danger' && (
        <div className="absolute bottom-2 left-2 max-w-[70%] rounded-md bg-paper/95 px-2 py-1 text-xs text-muted">{t.map.osmNote}</div>
      )}
      {selRow && (
        <div className="absolute inset-x-3 bottom-3 sm:inset-x-auto sm:top-3 sm:right-3 sm:bottom-auto sm:w-80">
          <PointCard row={selRow} onClose={() => setSel(null)} />
        </div>
      )}
    </div>
  )
}

export default function Today() {
  const { profile, place, pts, dayIdx, wx, replay } = useApp()
  const { day, modes } = useDay()
  const { t, f, lang } = useI18n()
  const info = useCondition()
  const rows = useRows()
  const officer = profile?.role !== 'partner'
  const cond = info?.cond
  const airFirst = cond === 'air' || cond === 'double'
  const fact = replay && dayIdx === 0 ? REPLAY_FACT[replay] : undefined
  // what-if spots: the most urgent place with people out in the day, and the most urgent busy road
  const heatSpot = rows.find((r) => r.point.people.some((c) => c.shift === 'day'))?.point ?? null
  const airSpot = rows.find((r) => r.point.traffic === 'busy')?.point ?? null
  const [aqiAfter, setAqiAfter] = useState<[number, number] | null>(null)
  const air = day && (
    <PanelBox title={t.air.title} right={<DemoTag label={t.src.model} />}>
      {fact && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
          <span className="num rounded-md px-2 py-1 text-3xl font-bold" style={{ background: AQI_COLOR[aqiCategory(fact.aqi)], color: aqiCategory(fact.aqi) >= 4 ? '#fff' : '#1b2330' }}>
            {fact.aqi}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-bold">
              {f(t.air.cpcbHead, { aqi: fact.aqi, time: hourLabel(fact.hour, lang) })} · {t.aqi[aqiCategory(fact.aqi)]}
            </div>
            <a href={fact.url} target="_blank" rel="noreferrer" className="text-xs text-muted underline">
              {t.air.cpcbSrc}
            </a>
          </div>
        </div>
      )}
      <AirPanel day={day} now={dayIdx === 0 ? wx?.data.air : null} after={aqiAfter} />
      {day.aqi != null && day.aqi > 100 && (
        <div className="mt-5 border-t border-line pt-4">
          <WhatIf focus="air" day={day} point={airSpot} onAqiAfter={setAqiAfter} />
        </div>
      )}
    </PanelBox>
  )
  const heatWhatIf = day && (info?.hz.heat ?? 0) >= 1 && (
    <PanelBox title={t.layer.heat} sub={heatSpot ? pointName(heatSpot, lang) : undefined}>
      <WhatIf focus="heat" day={day} point={heatSpot} />
    </PanelBox>
  )
  return (
    <div className="space-y-4">
      <TodayHero />
      {airFirst && air}
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <MapWithCard rows={rows} />
        <PanelBox
          title={t.who.title}
          sub={t.who.debtD}
          right={pts.kind === 'curated' ? <DemoTag label={t.src.estimated} /> : <DemoTag label={t.src.osm} />}
          className="xl:max-h-[420px] xl:overflow-y-auto"
        >
          <WhoList rows={rows} limit={8} plan={officer} />
        </PanelBox>
      </div>
      {(cond === 'hot' || cond === 'double' || cond === 'warm') && <ShadeClockPanel points={rows.map((r) => r.point)} />}
      {heatWhatIf}
      {!airFirst && air}
      <div className="grid gap-4 lg:grid-cols-4">
        <PanelBox title={t.checks.title} className="lg:col-span-2">
          <ChecksPanel />
        </PanelBox>
        <PanelBox title={dayIdx === 1 ? t.needs.titleTomorrow : t.needs.title}>
          <NeedsCards modes={modes} needs={info ? needsForDay(modes, info) : undefined} />
          {cond === 'cold' && <p className="mt-3 text-sm font-semibold">{t.fire.principle}</p>}
        </PanelBox>
        <PanelBox title={t.hours.title}>
          <HoursPanel />
        </PanelBox>
      </div>
      {place.pilot === 'gwalior' && <BothSeasons />}
      {!place.pilot && <p className="text-xs text-muted">{t.map.osmNote}</p>}
    </div>
  )
}
