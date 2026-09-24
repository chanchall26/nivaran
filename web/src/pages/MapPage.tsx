import type { PickingInfo } from '@deck.gl/core'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { GeoJsonLayer, IconLayer } from '@deck.gl/layers'
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js'
import { Box, ChevronUp, Layers, Navigation, Square, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CityStatus, directionsUrl, LevelPill, needText, NeedRing, SourceTag, WeatherChips } from '../components/kit'
import { MapView } from '../components/MapView'
import { useI18n } from '../i18n'
import { needColor, RAMPS } from '../lib/colors'
import { cellLabel } from '../lib/format'
import { deliveryIcon, PLACE_META, placeIcon, reportIcon } from '../lib/icons'
import { H3_RES } from '../lib/match'
import { band, score, type Breakdown } from '../lib/scoring'
import type { Cell, Delivery, Place, PlaceKind, Report } from '../lib/types'
import { useApp } from '../state'

type Scored = Cell & { b: Breakdown }

export default function MapPage() {
  const { city, season, weather, reports, deliveries } = useApp()
  const { s, f, lang } = useI18n()
  const [selected, setSelected] = useState<string | null>(null)
  const [is3d, setIs3d] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [kindsBySeason, setKindsBySeason] = useState<Record<string, Set<PlaceKind>>>({
    sardi: new Set<PlaceKind>(['shelter', 'homeless_spot', 'labour_chowk']),
    garmi: new Set<PlaceKind>(['rehri_zone', 'labour_chowk', 'transit']),
  })
  const [showReports, setShowReports] = useState(true)
  const [showDeliveries, setShowDeliveries] = useState(true)
  const fly = useRef<(lat: number, lon: number, z?: number) => void>(() => {})
  const kinds = kindsBySeason[season]
  const setKinds = (k: Set<PlaceKind>) => setKindsBySeason((m) => ({ ...m, [season]: k }))

  const scored: Scored[] = useMemo(
    () => (city ? city.cells.map((c) => ({ ...c, b: score(season, c, city.norms, weather) })) : []),
    [city, season, weather],
  )
  const byH3 = useMemo(() => new Map(scored.map((c) => [c.h3, c])), [scored])
  const worst = useMemo(() => [...scored].sort((a, b) => a.b.score - b.b.score).slice(0, 6), [scored])
  const summary = useMemo(() => {
    let n = 0
    let p = 0
    for (const c of scored) {
      const k = band(c.b.score)
      if (k === 'critical' || k === 'serious') {
        n++
        p += c.exposed
      }
    }
    return { n, p }
  }, [scored])
  const seasonReports = useMemo(() => reports.filter((r) => r.season === season), [reports, season])

  const select = useCallback((h3: string, flyTo = false) => {
    setSelected(h3)
    setSheetOpen(true)
    if (flyTo) {
      const [lat, lon] = cellToLatLng(h3)
      fly.current(lat, lon, 13.4)
    }
  }, [])

  const layers = useMemo(() => {
    if (!city) return []
    const sel = selected ? byH3.get(selected) : null
    const lift = is3d ? 1000 : 0
    return [
      new H3HexagonLayer<Scored>({
        id: 'cells',
        data: scored,
        getHexagon: (d) => d.h3,
        getFillColor: (d) => needColor(season, d.b.need),
        extruded: is3d,
        getElevation: (d) => 30 + d.b.need * 900,
        coverage: 0.92,
        stroked: false,
        pickable: true,
        highPrecision: false,
        material: { ambient: 0.55, diffuse: 0.6, shininess: 24, specularColor: [255, 255, 255] },
        transitions: { getElevation: 700 },
        updateTriggers: { getFillColor: [season, weather], getElevation: [season, weather] },
        onClick: (info) => {
          if (info.object) select(info.object.h3)
        },
      }),
      new GeoJsonLayer({
        id: 'boundary',
        data: city.boundary,
        stroked: true,
        filled: false,
        getLineColor: season === 'sardi' ? [200, 215, 255, 180] : [43, 22, 8, 150],
        lineWidthMinPixels: 2,
        updateTriggers: { getLineColor: season },
      }),
      sel &&
        new H3HexagonLayer<Scored>({
          id: 'selected',
          data: [sel],
          getHexagon: (d) => d.h3,
          extruded: is3d,
          wireframe: true,
          getElevation: (d) => 45 + d.b.need * 900,
          getFillColor: [255, 255, 255, 80],
          getLineColor: season === 'sardi' ? [255, 170, 90, 255] : [43, 22, 8, 255],
          stroked: true,
          lineWidthMinPixels: 3,
        }),
      new IconLayer<Place>({
        id: 'places',
        data: city.places.filter((p) => kinds.has(p.kind)),
        getPosition: (d) => [d.lon, d.lat, lift],
        getIcon: (d) => placeIcon(d.kind),
        getSize: 22,
        sizeUnits: 'pixels',
        pickable: true,
        updateTriggers: { getPosition: lift },
        onClick: (info) => {
          if (info.object) select(latLngToCell(info.object.lat, info.object.lon, H3_RES))
        },
      }),
      showDeliveries &&
        new IconLayer<Delivery>({
          id: 'deliveries',
          data: deliveries,
          getPosition: (d) => [d.lon + 0.0004, d.lat + 0.0004, lift],
          getIcon: () => deliveryIcon(),
          getSize: 18,
          sizeUnits: 'pixels',
          pickable: true,
          updateTriggers: { getPosition: lift },
        }),
      showReports &&
        new IconLayer<Report>({
          id: 'reports',
          data: seasonReports,
          getPosition: (d) => [d.lon, d.lat, lift + 100],
          getIcon: (d) => reportIcon(d.season, d.status === 'resolved'),
          getSize: 28,
          sizeUnits: 'pixels',
          pickable: true,
          updateTriggers: { getPosition: lift },
          onClick: (info) => {
            if (info.object) select(info.object.h3)
          },
        }),
    ].filter(Boolean) as never[]
  }, [city, scored, byH3, season, weather, selected, kinds, showReports, showDeliveries, deliveries, seasonReports, is3d, select])

  const getTooltip = useCallback(
    (info: PickingInfo) => {
      const o = info.object as Record<string, unknown> | undefined
      if (!o) return null
      const dark = season === 'sardi'
      const box = (html: string) => ({
        html: `<div style="font:14px Mukta,system-ui;max-width:250px;line-height:1.35">${html}</div>`,
        style: {
          background: dark ? '#17234d' : '#ffffff',
          color: dark ? '#eef1ff' : '#2b1608',
          border: '1px solid rgba(128,128,128,.25)',
          borderRadius: '12px',
          padding: '8px 12px',
          boxShadow: '0 12px 30px -10px rgba(0,0,0,.4)',
        },
      })
      const id = info.layer?.id
      if (id === 'cells') {
        const c = o as unknown as Scored
        return box(`<b>${cellLabel(c, s, lang)}</b><br>${s.need.label}: <b>${100 - c.b.score}</b>/100 · ${needText(c.b.score, s)}`)
      }
      if (id === 'places') {
        const p = o as unknown as Place
        return box(`<b>${s.place[p.kind]}</b>${p.name ? ` · ${p.name}` : ''}${p.staff ? `<br>${f(s.place.people, { n: p.staff })}` : ''}`)
      }
      if (id === 'reports') {
        const r = o as unknown as Report
        return box(`<b>${s.map.reports}</b><br>${s.cat[r.category]}`)
      }
      if (id === 'deliveries') {
        const d = o as unknown as Delivery
        return box(`<b>${s.map.delivered}</b><br>${d.qty} × ${s.item[d.item]} · ${s.status[d.status]}`)
      }
      return null
    },
    [season, s, f, lang],
  )

  if (!city) return <div className="p-16 text-center text-ink-3">{s.app.loading}</div>
  const sel = selected ? byH3.get(selected) ?? null : null

  const controls = (
    <div className="space-y-5">
      <CityStatus />
      <WeatherChips />
      <div>
        <div className="mb-1.5 flex justify-between text-xs font-semibold text-ink-2">
          <span>{s.need.less}</span>
          <span>{s.need.more}</span>
        </div>
        <div className="flex h-3.5 overflow-hidden rounded-full shadow-[inset_0_1px_3px_rgb(0_0_0/0.25)]" aria-hidden>
          {RAMPS[season].map((c) => (
            <div key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-3">{s.map.areaNote}</p>
        <p className="mt-2 text-sm text-ink-2">{f(s.map.areas, { n: summary.n, p: summary.p })}</p>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-sm font-bold">
          <Layers className="size-4" aria-hidden /> {s.map.layers}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PLACE_META) as PlaceKind[]).map((k) => {
            const on = kinds.has(k)
            const { Icon } = PLACE_META[k]
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = new Set(kinds)
                  if (on) next.delete(k)
                  else next.add(k)
                  setKinds(next)
                }}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors ${
                  on ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-ink-2'
                }`}
              >
                <Icon className="size-3.5" aria-hidden /> {s.place[k]}
              </button>
            )
          })}
          <button
            type="button"
            aria-pressed={showReports}
            onClick={() => setShowReports(!showReports)}
            className={`rounded-full border px-2.5 py-1 text-xs font-bold ${showReports ? 'border-transparent bg-critical text-white' : 'border-line bg-surface text-ink-2'}`}
          >
            {s.map.reports} ({seasonReports.length})
          </button>
          <button
            type="button"
            aria-pressed={showDeliveries}
            onClick={() => setShowDeliveries(!showDeliveries)}
            className={`rounded-full border px-2.5 py-1 text-xs font-bold ${showDeliveries ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-ink-2'}`}
          >
            {s.map.delivered} ({deliveries.length})
          </button>
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm font-bold">{s.map.topNeed}</div>
        <ol className="space-y-2">
          {worst.map((c, i) => (
            <li key={c.h3}>
              <button
                type="button"
                onClick={() => select(c.h3, true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-left shadow-[0_3px_0_var(--line)] transition-transform hover:-translate-y-0.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-sm font-extrabold">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{cellLabel(c, s, lang)}</span>
                  <span className="text-xs text-ink-3">{f(s.place.people, { n: c.exposed })}</span>
                </span>
                <span className="font-display text-lg font-extrabold text-critical tabular">{100 - c.b.score}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )

  return (
    <div className="relative h-[calc(100dvh-62px)] overflow-hidden">
      <MapView
        className="absolute inset-0"
        layers={layers}
        center={city.meta.center}
        zoom={11.6}
        dark={season === 'sardi'}
        pitch={is3d ? 50 : 0}
        bearing={is3d ? -18 : 0}
        getTooltip={getTooltip}
        onFlyTo={(fn) => (fly.current = fn)}
      />

      {/* 3D / 2D switch */}
      <div className="absolute top-3 right-3 z-20 flex rounded-2xl border border-line bg-glass p-1 shadow-[var(--shadow-float)] backdrop-blur">
        {([
          [true, s.map.view3d, Box],
          [false, s.map.view2d, Square],
        ] as const).map(([v, label, Icon]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={is3d === v}
            onClick={() => setIs3d(v)}
            className={`flex items-center gap-1 rounded-xl px-3 py-1.5 font-display text-sm font-bold ${is3d === v ? 'bg-ink text-bg' : 'text-ink-2'}`}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {/* desktop: left controls */}
      <aside className="glass absolute top-3 bottom-3 left-3 z-20 hidden w-[360px] flex-col overflow-hidden rounded-3xl lg:flex">
        <header className="border-b border-line px-5 pt-4 pb-3">
          <h1 className="font-display text-2xl font-extrabold">{s.map.title}</h1>
          <p className="text-sm text-ink-2">{season === 'sardi' ? s.map.subtitleSardi : s.map.subtitleGarmi}</p>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{controls}</div>
      </aside>

      {/* desktop: right details */}
      {sel && (
        <aside className="glass anim-rise absolute top-16 right-3 z-20 hidden max-h-[calc(100%-5rem)] w-[380px] overflow-y-auto rounded-3xl lg:block">
          <CellDetail cell={sel} places={city.places} reports={seasonReports} onClose={() => setSelected(null)} />
        </aside>
      )}

      {/* phone: bottom sheet, above the tab bar */}
      <div className="glass absolute inset-x-2 bottom-[5.75rem] z-30 flex max-h-[62dvh] flex-col overflow-hidden rounded-3xl lg:hidden">
        <button type="button" onClick={() => setSheetOpen(!sheetOpen)} aria-expanded={sheetOpen} className="flex items-center gap-3 px-4 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg leading-tight font-extrabold">{sel ? cellLabel(sel, s, lang) : s.map.title}</span>
            <span className="block truncate text-xs text-ink-2">
              {sel
                ? `${s.need.label} ${100 - sel.b.score}/100 · ${needText(sel.b.score, s)}`
                : f(s.map.areas, { n: summary.n, p: summary.p })}
            </span>
          </span>
          {sel && (
            <span
              role="button"
              tabIndex={0}
              aria-label={s.app.close}
              onClick={(e) => {
                e.stopPropagation()
                setSelected(null)
              }}
              className="rounded-xl p-1 text-ink-2"
            >
              <X className="size-5" />
            </span>
          )}
          <ChevronUp className={`size-6 shrink-0 transition-transform ${sheetOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {sheetOpen && (
          <div className="overflow-y-auto border-t border-line">
            {sel ? (
              <CellDetail cell={sel} places={city.places} reports={seasonReports} onClose={() => setSelected(null)} compact />
            ) : (
              <div className="px-4 py-4">{controls}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CellDetail({
  cell, places, reports, onClose, compact = false,
}: { cell: Scored; places: Place[]; reports: Report[]; onClose: () => void; compact?: boolean }) {
  const { s, f, lang, num } = useI18n()
  const { weather } = useApp()
  const near = useMemo(() => {
    const set = new Set(gridDisk(cell.h3, 1))
    return places.filter((p) => set.has(latLngToCell(p.lat, p.lon, H3_RES))).slice(0, 10)
  }, [places, cell.h3])
  const here = reports.filter((r) => r.h3 === cell.h3)
  const b = cell.b

  const detail = (key: string) => {
    switch (key) {
      case 'canopy':
        return cell.canopy == null ? s.factor.noData : f(s.factor.canopyD, { p: Math.round(cell.canopy * 100) })
      case 'lst':
        return cell.lst == null ? s.factor.noData : f(s.factor.lstD, { t: cell.lst.toFixed(1) })
      case 'exposure':
        return f(s.factor.exposureD, { pop: num(cell.pop), n: cell.exposed })
      case 'shelter':
        return f(s.factor.shelterD, { km: cell.shelterKm.toFixed(1) })
      case 'cold':
        return f(s.factor.coldD, { t: weather.nightMinFeels.toFixed(1) })
      case 'trap':
        return f(s.factor.trapD, { v: Math.round(weather.ventilation) })
      case 'day':
        return f(s.factor.dayD, { t: Math.round(weather.dayMaxFeels) })
    }
    return ''
  }

  return (
    <div className="space-y-5 p-5">
      {!compact && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl leading-tight font-extrabold">{cellLabel(cell, s, lang)}</h2>
            <p className="text-xs text-ink-3">
              {cell.lat.toFixed(4)}, {cell.lon.toFixed(4)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-ink-2 hover:bg-surface-2" aria-label={s.app.close}>
            <X className="size-5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <NeedRing score={b.score} />
        <div className="space-y-2">
          <LevelPill level={band(b.score)} text={needText(b.score, s)} />
          <p className="text-sm text-ink-2">{s.need.label}</p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-display text-lg font-extrabold">{s.map.why}</h3>
        <ul className="space-y-3">
          {b.factors.map((fc) => (
            <li key={fc.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-bold">{s.factor[fc.key]}</span>
                <span className="font-display font-extrabold tabular">{Math.round(fc.value * 100)}</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_1px_2px_rgb(0_0_0/0.2)]">
                <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${fc.value * 100}%` }} />
              </div>
              <p className="mt-0.5 text-xs text-ink-3">
                {detail(fc.key)}
                {fc.weight === 0 && ` · ${s.factor.multiplier}`}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-display text-lg font-extrabold">
          {s.map.whoHere} ({near.length})
        </h3>
        {near.length ? (
          <ul className="space-y-1.5">
            {near.map((p) => {
              const { Icon } = PLACE_META[p.kind]
              return (
                <li key={p.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <Icon className="size-4 shrink-0 text-ink-2" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <b>{s.place[p.kind]}</b>
                    {p.name ? <span className="text-ink-2"> · {p.name}</span> : null}
                    {p.staff ? <span className="text-ink-3"> · {f(s.place.people, { n: p.staff })}</span> : null}
                  </span>
                  <SourceTag source={p.source} />
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">{s.map.none}</p>
        )}
      </div>

      {here.length > 0 && (
        <div>
          <h3 className="mb-2 font-display text-lg font-extrabold">
            {s.map.reports} ({here.length})
          </h3>
          <ul className="space-y-1.5 text-sm">
            {here.map((r) => (
              <li key={r.id} className="rounded-xl bg-surface-2 px-3 py-2">
                {s.cat[r.category]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 pb-1">
        <Link to={`/report?h3=${cell.h3}`} className="btn-3d btn-primary col-span-2 px-4 py-3">
          {s.map.reportHere}
        </Link>
        <Link to="/match" className="btn-3d btn-soft px-4 py-3">
          {s.map.sendHelp}
        </Link>
        <a href={directionsUrl(cell.lat, cell.lon)} target="_blank" rel="noreferrer" title={s.map.openIn} className="btn-3d btn-soft px-4 py-3">
          <Navigation className="size-4" aria-hidden /> {s.map.directions}
        </a>
      </div>
    </div>
  )
}
