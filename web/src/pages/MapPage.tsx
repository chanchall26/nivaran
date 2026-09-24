import type { PickingInfo } from '@deck.gl/core'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { GeoJsonLayer, IconLayer } from '@deck.gl/layers'
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js'
import { ChevronDown, ChevronUp, Layers, MapPin, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapView } from '../components/MapView'
import { BandPill, CityAlert, SourceTag, WeatherSourcePicker } from '../components/ui'
import { needColor, RAMPS } from '../lib/colors'
import { deliveryIcon, PLACE_META, placeIcon, reportIcon } from '../lib/icons'
import { H3_RES } from '../lib/match'
import { CATEGORY_LABEL } from '../lib/policy'
import { band, score, type Breakdown } from '../lib/scoring'
import { cellLabel } from '../lib/format'
import type { Cell, Place, PlaceKind, Report } from '../lib/types'
import { useApp } from '../state'

type Scored = Cell & { b: Breakdown }

export default function MapPage() {
  const { city, season, weather, reports, deliveries } = useApp()
  const [selected, setSelected] = useState<string | null>(null)
  // default layers follow the season: who is most at risk now
  const [kindsBySeason, setKindsBySeason] = useState<Record<string, Set<PlaceKind>>>({
    sardi: new Set<PlaceKind>(['shelter', 'homeless_spot', 'labour_chowk']),
    garmi: new Set<PlaceKind>(['rehri_zone', 'labour_chowk', 'transit']),
  })
  const kinds = kindsBySeason[season]
  const setKinds = (k: Set<PlaceKind>) => setKindsBySeason((m) => ({ ...m, [season]: k }))
  const [showReports, setShowReports] = useState(true)
  const [showDeliveries, setShowDeliveries] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const fly = useRef<(lat: number, lon: number, z?: number) => void>(() => {})

  const scored: Scored[] = useMemo(
    () => (city ? city.cells.map((c) => ({ ...c, b: score(season, c, city.norms, weather) })) : []),
    [city, season, weather],
  )
  const byH3 = useMemo(() => new Map(scored.map((c) => [c.h3, c])), [scored])
  const worst = useMemo(() => [...scored].sort((a, b) => a.b.score - b.b.score).slice(0, 8), [scored])
  const summary = useMemo(() => {
    const counts = { critical: 0, serious: 0, warning: 0, ok: 0 }
    let people = 0
    for (const c of scored) {
      const k = band(c.b.score)
      counts[k]++
      if (k === 'critical' || k === 'serious') people += c.exposed
    }
    return { counts, people }
  }, [scored])

  const seasonReports = useMemo(() => reports.filter((r) => r.season === season), [reports, season])

  const layers = useMemo(() => {
    if (!city) return []
    const sel = selected ? byH3.get(selected) : null
    return [
      new H3HexagonLayer<Scored>({
        id: 'cells',
        data: scored,
        getHexagon: (d) => d.h3,
        getFillColor: (d) => needColor(season, d.b.need),
        stroked: false,
        extruded: false,
        pickable: true,
        highPrecision: false,
        updateTriggers: { getFillColor: [season, weather] },
        onClick: (info) => {
          if (info.object) setSelected(info.object.h3)
        },
      }),
      new GeoJsonLayer({
        id: 'boundary',
        data: city.boundary,
        stroked: true,
        filled: false,
        getLineColor: [29, 27, 24, 160],
        lineWidthMinPixels: 1.5,
      }),
      sel &&
        new H3HexagonLayer({
          id: 'selected',
          data: [sel],
          getHexagon: (d: Scored) => d.h3,
          filled: false,
          stroked: true,
          getLineColor: [29, 27, 24, 255],
          lineWidthMinPixels: 3,
        }),
      new IconLayer<Place>({
        id: 'places',
        data: city.places.filter((p) => kinds.has(p.kind)),
        getPosition: (d) => [d.lon, d.lat],
        getIcon: (d) => placeIcon(d.kind),
        getSize: 18,
        sizeUnits: 'pixels',
        pickable: true,
        onClick: (info) => {
          if (info.object) setSelected(latLngToCell(info.object.lat, info.object.lon, H3_RES))
        },
      }),
      showDeliveries &&
        new IconLayer({
          id: 'deliveries',
          data: deliveries,
          getPosition: (d: (typeof deliveries)[number]) => [d.lon + 0.0004, d.lat + 0.0004],
          getIcon: () => deliveryIcon(),
          getSize: 16,
          pickable: true,
        }),
      showReports &&
        new IconLayer<Report>({
          id: 'reports',
          data: seasonReports,
          getPosition: (d) => [d.lon, d.lat],
          getIcon: (d) => reportIcon(d.season, d.status === 'resolved'),
          getSize: 24,
          pickable: true,
          onClick: (info) => {
            if (info.object) setSelected(info.object.h3)
          },
        }),
    ].filter(Boolean) as never[]
  }, [city, scored, byH3, season, weather, selected, kinds, showReports, showDeliveries, deliveries, seasonReports])

  const getTooltip = useCallback(
    (info: PickingInfo) => {
      const o = info.object as Record<string, unknown> | undefined
      if (!o) return null
      const box = (html: string) => ({
        html: `<div style="font:13px Mukta,system-ui;max-width:240px;line-height:1.35">${html}</div>`,
        style: { background: '#fff', color: '#1d1b18', border: '1px solid #e7e3da', borderRadius: '8px', padding: '8px 10px' },
      })
      if (info.layer?.id === 'cells') {
        const c = o as unknown as Scored
        return box(
          `<b>${cellLabel(c)}</b><br>${season === 'garmi' ? 'Chhaya' : 'Alaav'} Score <b>${c.b.score}</b>/100 · ${
            c.exposed
          } bahar-log`,
        )
      }
      if (info.layer?.id === 'places') {
        const p = o as unknown as Place
        return box(
          `<b>${PLACE_META[p.kind].label}</b>${p.name ? ` · ${p.name}` : ''}<br>${p.who}${
            p.staff ? ` · ~${p.staff} log` : ''
          }<br><span style="color:#8a877f">source: ${p.source}</span>`,
        )
      }
      if (info.layer?.id === 'reports') {
        const r = o as unknown as Report
        return box(`<b>Report</b> · ${CATEGORY_LABEL[r.category]}<br>${r.summary}<br>Status: ${r.status}`)
      }
      if (info.layer?.id === 'deliveries') {
        const d = o as unknown as (typeof deliveries)[number]
        return box(`<b>Madad pahunchi</b> · ${d.qty}× ${d.item}<br>${d.placeName}<br>Status: ${d.status}`)
      }
      return null
    },
    [season],
  )

  if (!city) return <div className="p-10 text-center text-ink-3">Gwalior ka data load ho raha hai…</div>

  const sel = selected ? byH3.get(selected) : null
  const scoreName = season === 'garmi' ? 'Chhaya Score' : 'Alaav Score'

  return (
    <div className="relative h-[calc(100dvh-57px)]">
      <MapView
        className="absolute inset-0"
        layers={layers}
        center={city.meta.center}
        zoom={12.3}
        getTooltip={getTooltip}
        onFlyTo={(f) => (fly.current = f)}
      />

      {/* left control panel */}
      <aside className="absolute left-3 top-3 z-10 w-[min(360px,calc(100vw-24px))] rounded-xl border border-line bg-white/95 shadow-lg backdrop-blur">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-expanded={panelOpen}
        >
          <span>
            <span className="block text-xs uppercase tracking-wide text-ink-3">Bahar-Log Map · Gwalior</span>
            <span className="text-lg font-bold">
              {scoreName}{' '}
              <span className="text-sm font-normal text-ink-2">
                ({season === 'garmi' ? 'kam = chhaaya ki zaroorat' : 'kam = garmahat ki zaroorat'})
              </span>
            </span>
          </span>
          {panelOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
        </button>

        {panelOpen && (
          <div className="max-h-[calc(100dvh-160px)] space-y-4 overflow-y-auto border-t border-line px-4 py-3">
            <div className="space-y-2">
              <WeatherSourcePicker />
              <CityAlert compact />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs text-ink-2">
                <span>100 · theek</span>
                <span>0 · sabse zyada zaroorat</span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
                {RAMPS[season].map((c) => (
                  <div key={c} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              <p className="mt-2 text-sm text-ink-2">
                <b className="text-ink">{summary.counts.critical + summary.counts.serious}</b> hexagon (~0.1 km² har ek) zyada
                zaroorat mein · wahan <b className="text-ink">{summary.people.toLocaleString('en-IN')}</b> bahar-log
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                <Layers className="size-4" aria-hidden /> Layers
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PLACE_META) as PlaceKind[]).map((k) => {
                  const on = kinds.has(k)
                  const { Icon, label } = PLACE_META[k]
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
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                        on ? 'border-ink bg-ink text-white' : 'border-line text-ink-2'
                      }`}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  aria-pressed={showReports}
                  onClick={() => setShowReports(!showReports)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${showReports ? 'border-critical bg-critical text-white' : 'border-line text-ink-2'}`}
                >
                  Reports ({seasonReports.length})
                </button>
                <button
                  type="button"
                  aria-pressed={showDeliveries}
                  onClick={() => setShowDeliveries(!showDeliveries)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${showDeliveries ? 'border-ink bg-ink text-white' : 'border-line text-ink-2'}`}
                >
                  Madad pahunchi ({deliveries.length})
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-sm font-semibold">Sabse zyada zaroorat</div>
              <ol className="space-y-1">
                {worst.map((c, i) => (
                  <li key={c.h3}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(c.h3)
                        const [lat, lon] = cellToLatLng(c.h3)
                        fly.current(lat, lon, 15)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-black/5"
                    >
                      <span className="w-4 text-ink-3 tabular">{i + 1}</span>
                      <span className="flex-1 truncate">{cellLabel(c)}</span>
                      <span className="text-xs text-ink-3">{c.exposed} log</span>
                      <b className="w-7 text-right tabular">{c.b.score}</b>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </aside>

      {/* selected cell detail */}
      {sel && (
        <CellPanel
          cell={sel}
          scoreName={scoreName}
          places={city.places}
          reports={seasonReports}
          onClose={() => setSelected(null)}
          neighbours={gridDisk(sel.h3, 1)}
        />
      )}
    </div>
  )
}

function CellPanel({
  cell,
  scoreName,
  places,
  reports,
  neighbours,
  onClose,
}: {
  cell: Scored
  scoreName: string
  places: Place[]
  reports: Report[]
  neighbours: string[]
  onClose: () => void
}) {
  const near = useMemo(() => {
    const set = new Set(neighbours)
    return places.filter((p) => set.has(latLngToCell(p.lat, p.lon, H3_RES))).slice(0, 12)
  }, [places, neighbours])
  const here = reports.filter((r) => r.h3 === cell.h3)
  const b = cell.b
  return (
    <aside className="absolute bottom-3 right-3 z-10 max-h-[70dvh] w-[min(380px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-line bg-white shadow-lg sm:top-3 sm:bottom-auto sm:max-h-[calc(100dvh-90px)]">
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <div className="flex items-center gap-1 text-xs text-ink-3">
            <MapPin className="size-3" aria-hidden /> {cell.lat.toFixed(4)}, {cell.lon.toFixed(4)}
          </div>
          <h2 className="text-lg font-bold">{cellLabel(cell)}</h2>
          {cell.areaHi && <div className="text-sm text-ink-2">{cell.areaHi}</div>}
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-black/5" aria-label="Band karo">
          <X className="size-5" />
        </button>
      </header>
      <div className="space-y-4 px-4 py-3">
        <div className="flex items-end gap-3">
          <div>
            <div className="text-xs text-ink-2">{scoreName}</div>
            <div className="text-4xl font-extrabold tabular">
              {b.score}
              <span className="text-lg font-normal text-ink-3">/100</span>
            </div>
          </div>
          <BandPill band={band(b.score)} />
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold">Score kaise bana</div>
          <ul className="space-y-2">
            {b.factors.map((f) => (
              <li key={f.key}>
                <div className="flex justify-between text-sm">
                  <span>
                    {f.label}
                    {f.weight > 0 && <span className="text-ink-3"> · weight {f.weight}</span>}
                  </span>
                  <span className="tabular">{Math.round(f.value * 100)}</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-[var(--accent-600)]" style={{ width: `${f.value * 100}%` }} />
                </div>
                <div className="text-xs text-ink-3">{f.detail}</div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold">Aas-paas ke bahar-log ({near.length})</div>
          {near.length ? (
            <ul className="space-y-1 text-sm">
              {near.map((p) => {
                const { Icon, label } = PLACE_META[p.kind]
                return (
                  <li key={p.id} className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0 text-ink-2" aria-hidden />
                    <span className="flex-1 truncate">
                      {p.name ?? label}
                      {p.staff ? <span className="text-ink-3"> · ~{p.staff}</span> : null}
                    </span>
                    <SourceTag source={p.source} />
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Is hisse mein koi mapped point nahi. Report karke jodiye.</p>
          )}
        </div>

        {here.length > 0 && (
          <div>
            <div className="mb-1 text-sm font-semibold">Reports ({here.length})</div>
            <ul className="space-y-1 text-sm">
              {here.map((r) => (
                <li key={r.id} className="rounded-lg bg-paper px-2 py-1">
                  {CATEGORY_LABEL[r.category]} · <span className="text-ink-3">{r.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Link
            to={`/report?h3=${cell.h3}`}
            className="flex-1 rounded-lg bg-[var(--accent-600)] px-3 py-2 text-center text-sm font-semibold text-white"
          >
            Yahan report karo
          </Link>
          <Link to="/match" className="flex-1 rounded-lg border border-line px-3 py-2 text-center text-sm font-semibold">
            Madad bhejo (Match)
          </Link>
        </div>
      </div>
    </aside>
  )
}
