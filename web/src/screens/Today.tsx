import { Flame, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useDay } from '../ctx'
import { useI18n } from '../i18n'
import { hourLabel, longDate } from '../lib/ist'
import { REPLAY_FACT } from '../lib/live'
import { AQI_COLOR, aqiCategory, LEVEL_COLOR } from '../lib/risk'
import { taskStore } from '../lib/tasks'
import { AirPanel } from '../ui/AirPanel'
import { DemoTag, ICON, LevelBadge, Skel, Src } from '../ui/atoms'
import { PointsMap, type MapMarker } from '../ui/PointsMap'
import { WhatIf } from '../ui/WhatIf'
import { FireParts, HistoryList, PanelBox, ProtectionLine, useLinkTo, WhoList } from './panels'
import { pointName, useCrews, useRows, type Row } from './shared'

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

/** Row 1: what we found for this place — the AQI number, in plain words, today or tomorrow. */
export function InvestigationHero() {
  const { place, wx, wxStatus, dayIdx, replay, refresh } = useApp()
  const { day } = useDay()
  const { t, f, lang } = useI18n()
  const name = lang === 'hi' ? place.nameHi : place.name
  const title = f(dayIdx === 0 ? t.today.investigationTitle : t.today.investigationTitleTomorrow, { place: name })
  const cat = day?.aqi != null ? aqiCategory(day.aqi) : null

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
    <section className="panel p-4 sm:p-5" aria-busy={!day}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl leading-tight font-bold sm:text-[28px]">{title}</h1>
        <DayTabs />
      </div>
      {!day ? (
        <Skel className="h-16 w-full" />
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Src kind="live">
            <span className="num text-6xl font-bold" style={{ color: cat != null ? AQI_COLOR[cat] : undefined }}>
              {day.aqi ?? '—'}
            </span>
          </Src>
          <div>
            <div className="font-display text-lg font-bold">{cat != null ? t.aqi[cat] : t.air.none}</div>
            <p className="text-sm text-muted">{t.today.investigationSub}</p>
            {replay && wx?.data.replayDate && (
              <p className="mt-1 text-xs font-semibold text-muted">{f(t.src.replay, { date: longDate(wx.data.replayDate, lang) })}</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** Side card for a tapped map point. */
export function PointCard({ row, onClose }: { row: Row; onClose: () => void }) {
  const { t, f, lang } = useI18n()
  const { profile } = useApp()
  const crews = useCrews()
  const to = useLinkTo()
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
      {profile?.role !== 'worker' && row.risk.burning && (
        <div className="mt-2 flex flex-wrap gap-2">
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
        </div>
      )}
      {fireSaved && (
        <p className="mt-2 text-sm font-semibold" role="status">
          {t.fire.reported}
        </p>
      )}
    </div>
  )
}

type Layer = 'danger' | 'air' | 'fire'

/** The investigation map: pollution risk, air quality, and burning/smoke sources on one map. */
export function MapWithCard({ rows, height = 'h-[420px]' }: { rows: Row[]; height?: string }) {
  const { place, pts } = useApp()
  const { t, f, lang } = useI18n()
  const [view, setView] = useState<'near' | 'city'>('city')
  const [sel, setSel] = useState<string | null>(null)
  const [layerPick, setLayer] = useState<Layer | null>(null)
  const { day } = useDay()
  const anyFire = rows.some((r) => r.risk.burning && r.risk.burning.level !== 'low')
  const layers: Layer[] = ['danger', 'air', ...((anyFire ? ['fire'] : []) as Layer[])]
  const auto: Layer = anyFire ? 'fire' : 'air'
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
      {layer === 'air' && <div className="absolute bottom-2 left-2 max-w-[70%] rounded-md bg-paper/95 px-2 py-1 text-xs">{t.map.airSize}</div>}
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
  const { profile, place, dayIdx, wx, replay } = useApp()
  const { day } = useDay()
  const { t, f, lang } = useI18n()
  const rows = useRows()
  const officer = profile?.role !== 'partner'
  const fact = replay && dayIdx === 0 ? REPLAY_FACT[replay] : undefined
  const airSpot = rows.find((r) => r.point.traffic === 'busy')?.point ?? null
  const [aqiAfter, setAqiAfter] = useState<[number, number] | null>(null)
  return (
    <div className="space-y-4">
      <InvestigationHero />
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <MapWithCard rows={rows} />
        <PanelBox
          emoji="people"
          title={t.who.title}
          sub={t.who.debtD}
          right={rows.length ? <DemoTag label={t.src.estimated} /> : undefined}
          className="xl:max-h-[420px] xl:overflow-y-auto"
        >
          <WhoList rows={rows} limit={8} plan={officer} />
        </PanelBox>
      </div>
      {day && (
        <PanelBox emoji="leaf" title={t.air.title} right={<DemoTag label={t.src.model} />}>
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
      )}
      {!place.pilot && <p className="text-xs text-muted">{t.map.osmNote}</p>}
    </div>
  )
}
