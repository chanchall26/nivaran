import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { cellToLatLng } from 'h3-js'
import { CheckCheck, Droplets, Flame, Home, Loader2, Minus, PackageCheck, Plus, Shirt, Sprout, Tent, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Btn, inr, Panel, SectionTitle, TiltCard } from '../components/kit'
import { MapView } from '../components/MapView'
import { useI18n } from '../i18n'
import { allocName } from '../lib/format'
import { allocate, firstComeBaseline, ITEMS, needWeightedReach, planCost, type Allocation } from '../lib/match'
import { store } from '../lib/store'
import type { ItemType } from '../lib/types'
import { useApp } from '../state'

const DEFAULT_UNITS: Record<ItemType, number> = { heater: 60, socket_fix: 10, warm_kit: 150, cabin: 12, shade_net: 25, water_pot: 40, sapling: 300 }
const MAX_UNITS: Record<ItemType, number> = { heater: 400, socket_fix: 100, warm_kit: 400, cabin: 60, shade_net: 200, water_pot: 200, sapling: 2000 }
const ITEM_ICON: Record<ItemType, typeof Flame> = {
  heater: Flame, socket_fix: Flame, warm_kit: Shirt, cabin: Home, shade_net: Tent, water_pot: Droplets, sapling: Sprout,
}

export default function Match() {
  const { city, season, weather, typicalWeather, reports, deliveries } = useApp()
  const { s, f, lang, num } = useI18n()
  // this season's items first, the all-season cabin last
  const seasonal = (Object.keys(ITEMS) as ItemType[])
    .filter((t) => t !== 'socket_fix' && (ITEMS[t].season === season || ITEMS[t].season === 'both'))
    .sort((a, b) => Number(ITEMS[a].season === 'both') - Number(ITEMS[b].season === 'both'))
  const [params] = useSearchParams()
  const wanted = params.get('item') as ItemType | null
  const first = wanted && seasonal.includes(wanted) ? wanted : seasonal[0]
  const [item, setItem] = useState<ItemType>(first)
  const [units, setUnits] = useState(DEFAULT_UNITS[first])
  const [donor, setDonor] = useState('Demo CSR Foundation')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)

  const active = seasonal.includes(item) ? item : seasonal[0]
  const spec = ITEMS[active]
  const byH3 = useMemo(() => new Map((city?.cells ?? []).map((c) => [c.h3, c])), [city])

  const served = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of deliveries) if (d.item === active) m.set(d.placeId ?? d.h3, (m.get(d.placeId ?? d.h3) ?? 0) + d.qty)
    return m
  }, [deliveries, active])

  const { plan, baseline } = useMemo(() => {
    if (!city) return { plan: [] as Allocation[], baseline: [] as Allocation[] }
    const opts = {
      item: active, units, cells: city.cells, places: city.places, reports, norms: city.norms,
      weather: weather.source === 'live' ? typicalWeather : weather, typicalWeather, alreadyServed: served,
    }
    return { plan: allocate(opts), baseline: firstComeBaseline({ ...opts, alreadyServed: undefined }) }
  }, [city, active, units, reports, weather, typicalWeather, served])

  const reach = needWeightedReach(plan)
  const baseReach = needWeightedReach(baseline)
  const people = plan.reduce((a, x) => a + x.people, 0)
  // need >= 0.4 = the "high need" bands on the map
  const highNeed = (p: Allocation[]) => p.filter((a) => a.need >= 0.4).reduce((acc, a) => acc + a.people, 0)
  const ratio = baseReach > 0 ? reach / baseReach : null

  const layers = useMemo(() => {
    if (!city) return []
    const planColor: [number, number, number, number] = season === 'sardi' ? [255, 138, 61, 240] : [228, 87, 30, 240]
    return [
      new GeoJsonLayer({
        id: 'b', data: city.boundary, filled: false, lineWidthMinPixels: 1.5,
        getLineColor: season === 'sardi' ? [200, 215, 255, 150] : [43, 22, 8, 130], updateTriggers: { getLineColor: season },
      }),
      new H3HexagonLayer<Allocation>({
        id: 'plan-cells', data: plan.filter((a) => a.target.kind === 'cell'), getHexagon: (a) => a.h3,
        getFillColor: planColor, stroked: false, extruded: true, getElevation: (a) => 100 + a.qty * 60,
      }),
      new ScatterplotLayer<Allocation>({
        id: 'baseline', data: baseline, getPosition: (a) => [a.lon, a.lat], getRadius: 7, radiusUnits: 'pixels',
        filled: false, stroked: true, getLineColor: season === 'sardi' ? [184, 194, 232, 255] : [107, 74, 51, 255], lineWidthMinPixels: 2,
      }),
      new ScatterplotLayer<Allocation>({
        id: 'plan', data: plan.filter((a) => a.target.kind === 'place'), getPosition: (a) => [a.lon, a.lat],
        getRadius: (a) => 5 + Math.sqrt(a.qty) * 2.5, radiusUnits: 'pixels', getFillColor: planColor,
        stroked: true, getLineColor: [255, 255, 255, 255], lineWidthMinPixels: 1.5,
      }),
    ]
  }, [city, plan, baseline, season])

  const approve = async () => {
    setSaving(true)
    const now = Date.now()
    await store.addMany(
      'deliveries',
      plan.map((a) => {
        const [lat, lon] = a.target.kind === 'place' ? [a.lat, a.lon] : cellToLatLng(a.h3)
        const cell = byH3.get(a.h3)!
        return {
          item: a.item, qty: a.qty, placeId: a.target.kind === 'place' ? a.target.place.id : undefined, h3: a.h3, lat, lon,
          placeName: allocName(a.target, cell, s, lang), donor, status: 'planned' as const, createdAt: now, people: a.people,
        }
      }),
    )
    setSaved(plan.length)
    setSaving(false)
  }

  const planned = deliveries.filter((d) => d.status === 'planned')
  const markDelivered = async () => {
    const now = Date.now()
    await Promise.all(planned.map((d) => store.update('deliveries', d.id, { status: 'delivered', deliveredAt: now })))
  }

  if (!city) return <div className="p-16 text-center text-ink-3">{s.app.loading}</div>

  const step = Math.max(1, Math.round(MAX_UNITS[active] / 40))

  return (
    <div className="space-y-8">
      <SectionTitle sub={s.match.intro}>{s.match.title}</SectionTitle>

      {/* 1. what */}
      <section>
        <h2 className="mb-3 font-display text-xl font-extrabold">1 · {s.match.what}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {seasonal.map((t) => {
            const Icon = ITEM_ICON[t]
            const on = active === t
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setItem(t)
                  setUnits(DEFAULT_UNITS[t])
                  setSaved(null)
                }}
                className="text-left"
              >
                <TiltCard
                  className={`h-full rounded-3xl border-2 p-4 transition-colors ${
                    on ? 'border-accent bg-accent-soft shadow-[0_6px_0_var(--accent-edge)]' : 'border-line bg-surface shadow-[0_6px_0_var(--line)]'
                  }`}
                >
                  <span className={`pop flex size-12 items-center justify-center rounded-2xl ${on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2'}`}>
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <div className="pop mt-3 font-display text-lg leading-tight font-extrabold">{s.item[t]}</div>
                  <div className="pop mt-0.5 text-xs text-ink-2">{s.item[`${t}D` as 'heaterD']}</div>
                  <div className="pop mt-2 flex items-center justify-between">
                    <span className="font-display font-bold tabular">{inr(ITEMS[t].unitCostInr)}</span>
                    {ITEMS[t].season === 'both' && (
                      <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-bg">{s.item.both}</span>
                    )}
                  </div>
                </TiltCard>
              </button>
            )
          })}
        </div>
        {active === 'cabin' && <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">{s.match.cabinNote}</p>}
      </section>

      {/* 2. how many + donor */}
      <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Panel>
          <h2 className="mb-3 font-display text-xl font-extrabold">2 · {s.match.howMany}</h2>
          <div className="flex items-center gap-3">
            <Btn variant="soft" onClick={() => setUnits(Math.max(1, units - step))} aria-label="-">
              <Minus className="size-5" />
            </Btn>
            <div className="flex-1 text-center font-display text-5xl font-extrabold tabular">{num(units)}</div>
            <Btn variant="soft" onClick={() => setUnits(Math.min(MAX_UNITS[active], units + step))} aria-label="+">
              <Plus className="size-5" />
            </Btn>
          </div>
          <input
            type="range"
            min={1}
            max={MAX_UNITS[active]}
            value={units}
            onChange={(e) => {
              setUnits(Number(e.target.value))
              setSaved(null)
            }}
            className="mt-4 w-full accent-[var(--accent)]"
            aria-label={s.match.howMany}
          />
        </Panel>
        <Panel>
          <label className="block">
            <span className="mb-2 block font-display text-xl font-extrabold">3 · {s.match.donor}</span>
            <input value={donor} onChange={(e) => setDonor(e.target.value)} className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 font-semibold" />
          </label>
          <Btn className="mt-4 w-full" size="lg" disabled={!plan.length || saving || !donor.trim()} onClick={approve}>
            {saving ? <Loader2 className="size-5 animate-spin" /> : <PackageCheck className="size-5" />}
            {f(s.match.approve, { n: plan.length })}
          </Btn>
          {saved != null && <p className="mt-2 text-sm font-semibold text-good">{f(s.match.approved, { n: saved })}</p>}
          {planned.length > 0 && (
            <Btn variant="soft" className="mt-3 w-full" onClick={markDelivered}>
              <CheckCheck className="size-4" /> {f(s.match.markDelivered, { n: planned.length })}
            </Btn>
          )}
        </Panel>
      </section>

      {/* results */}
      <section className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          <TiltCard className="surface-3d overflow-hidden p-6" max={5}>
            <div className="pop flex items-center gap-2 text-sm font-bold text-ink-2">
              <TrendingUp className="size-5 text-good" aria-hidden /> {s.match.better}
            </div>
            <div className="pop-lg mt-1 font-display text-7xl font-extrabold text-good tabular">{ratio ? `${ratio.toFixed(1)}×` : '—'}</div>
            <p className="pop text-ink-2">{s.match.betterSub}</p>
            <div className="pop mt-5 space-y-3" role="img" aria-label={`${s.match.legendPlan} ${Math.round(reach)}, ${s.match.legendFirst} ${Math.round(baseReach)}`}>
              {[
                [s.match.legendPlan, reach, 'var(--accent)'],
                [s.match.legendFirst, baseReach, 'var(--ink-3)'],
              ].map(([label, v, color]) => (
                <div key={label as string}>
                  <div className="flex justify-between text-sm font-semibold">
                    <span>{label as string}</span>
                  </div>
                  <div className="mt-1 h-4 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${(Number(v) / Math.max(reach, baseReach, 1)) * 100}%`, background: color as string }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </TiltCard>
          <div className="grid grid-cols-3 gap-3">
            {[
              [s.match.people, num(people), f(s.match.places, { n: plan.length })],
              [s.match.cost, inr(planCost(plan)), f(s.match.perUnit, { c: inr(spec.unitCostInr) })],
              [s.match.highNeed, num(highNeed(plan)), f(s.match.firstCome, { n: num(highNeed(baseline)) })],
            ].map(([label, value, sub]) => (
              <div key={label} className="surface-3d p-3.5">
                <div className="text-xs font-semibold text-ink-2">{label}</div>
                <div className="mt-1 font-display text-2xl font-extrabold tabular">{value}</div>
                <div className="text-[11px] text-ink-3">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-3d overflow-hidden !p-0">
          <MapView className="relative h-[360px]" layers={layers} center={city.meta.center} zoom={11.3} dark={season === 'sardi'} pitch={35} bearing={-12} />
          <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2.5 text-xs font-semibold text-ink-2">
            <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-full bg-accent" /> {s.match.legendPlan}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border-2 border-ink-2" /> {s.match.legendFirst}</span>
          </div>
        </div>
      </section>

      <Panel>
        <h2 className="mb-3 font-display text-xl font-extrabold">{f(s.match.listTitle, { n: plan.length })}</h2>
        <div className="max-h-[440px] space-y-2 overflow-auto pr-1">
          {plan.map((a) => {
            const cell = byH3.get(a.h3)!
            const extra =
              a.target.kind === 'cell'
                ? f(s.match.whyTrees, { p: Math.round((cell.canopy ?? 0) * 100), t: Math.round(cell.lst ?? 0) })
                : a.target.place.kind !== 'shelter'
                  ? f(s.match.whyShelter, { km: cell.shelterKm.toFixed(1) })
                  : ''
            return (
              <div key={`${a.h3}-${a.lat}-${a.lon}`} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3">
                <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-surface font-display leading-none font-extrabold shadow-[0_3px_0_var(--line)]">
                  <span className="text-lg tabular">{a.qty}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{allocName(a.target, cell, s, lang)}</div>
                  <div className="text-xs text-ink-2">
                    {f(s.match.whyLine, { need: Math.round(a.need * 100), n: a.people })}
                    {extra && ` · ${extra}`}
                    {a.reports > 0 && ` · ${f(s.match.whyReports, { r: a.reports })}`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
