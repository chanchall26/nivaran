import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { cellToLatLng } from 'h3-js'
import { CheckCheck, Loader2, PackageCheck, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MapView } from '../components/MapView'
import { Card, inr, Stat } from '../components/ui'
import { allocate, firstComeBaseline, ITEMS, needWeightedReach, planCost, type Allocation } from '../lib/match'
import { store } from '../lib/store'
import type { ItemType } from '../lib/types'
import { useApp } from '../state'

const DEFAULT_UNITS: Record<ItemType, number> = {
  heater: 60, warm_kit: 150, cabin: 12, shade_net: 25, water_pot: 40, sapling: 300,
}

export default function Match() {
  const { city, season, weather, typicalWeather, reports, deliveries } = useApp()
  // this season's items first, the all-season cabin last
  const seasonal = (Object.keys(ITEMS) as ItemType[])
    .filter((t) => ITEMS[t].season === season || ITEMS[t].season === 'both')
    .sort((a, b) => Number(ITEMS[a].season === 'both') - Number(ITEMS[b].season === 'both'))
  const [item, setItem] = useState<ItemType>(seasonal[0])
  const [units, setUnits] = useState(DEFAULT_UNITS[seasonal[0]])
  const [donor, setDonor] = useState('Demo CSR Foundation')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)

  const activeItem = seasonal.includes(item) ? item : seasonal[0]
  const spec = ITEMS[activeItem]

  const served = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of deliveries) if (d.item === activeItem) m.set(d.placeId ?? d.h3, (m.get(d.placeId ?? d.h3) ?? 0) + d.qty)
    return m
  }, [deliveries, activeItem])

  const { plan, baseline } = useMemo(() => {
    if (!city) return { plan: [] as Allocation[], baseline: [] as Allocation[] }
    const opts = {
      item: activeItem, units, cells: city.cells, places: city.places, reports, norms: city.norms,
      weather: weather.source === 'live' ? typicalWeather : weather, typicalWeather, alreadyServed: served,
    }
    return { plan: allocate(opts), baseline: firstComeBaseline({ ...opts, alreadyServed: undefined }) }
  }, [city, activeItem, units, reports, weather, typicalWeather, served])

  const reach = needWeightedReach(plan)
  const baseReach = needWeightedReach(baseline)
  const people = plan.reduce((s, a) => s + a.people, 0)
  // need >= 0.4 is score < 60, the 'zyada zaroorat' bands on the map
  const highNeed = (p: Allocation[]) => p.filter((a) => a.need >= 0.4).reduce((s, a) => s + a.people, 0)

  const layers = useMemo(() => {
    if (!city) return []
    return [
      new GeoJsonLayer({ id: 'b', data: city.boundary, filled: false, getLineColor: [29, 27, 24, 140], lineWidthMinPixels: 1 }),
      new H3HexagonLayer<Allocation>({
        id: 'plan-cells', data: plan.filter((a) => a.target.kind === 'cell'), getHexagon: (a) => a.h3,
        getFillColor: [201, 80, 31, 170], stroked: false,
      }),
      new ScatterplotLayer<Allocation>({
        id: 'baseline', data: baseline, getPosition: (a) => [a.lon, a.lat], getRadius: 6, radiusUnits: 'pixels',
        getFillColor: [255, 255, 255, 0], stroked: true, getLineColor: [138, 135, 127, 255], lineWidthMinPixels: 1.5,
      }),
      new ScatterplotLayer<Allocation>({
        id: 'plan', data: plan.filter((a) => a.target.kind === 'place'), getPosition: (a) => [a.lon, a.lat],
        getRadius: (a) => 4 + Math.sqrt(a.qty) * 2, radiusUnits: 'pixels',
        getFillColor: season === 'sardi' ? [28, 92, 171, 230] : [201, 80, 31, 230],
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
        return {
          item: a.item, qty: a.qty, placeId: a.target.kind === 'place' ? a.target.place.id : undefined,
          h3: a.h3, lat, lon, placeName: a.name, donor, status: 'planned' as const, createdAt: now, people: a.people,
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

  if (!city) return <div className="p-10 text-center text-ink-3">Load ho raha hai…</div>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Barahmasa Match</h1>
        <p className="mt-1 max-w-3xl text-ink-2">
          Seemit saamaan, sabse zyada asar. Har unit wahan jaata hai jahan <b className="text-ink">zaroorat × log</b> sabse
          zyada ho; ek jagah bhar jaane pe agla unit agli jagah. Reports thoda sa hi weight paati hain, taaki
          smartphone wale ilaake gareeb ilaakon se aage na nikal jaayein.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card title="Kya bhejna hai?">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-1.5">
              {seasonal.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={activeItem === t}
                  onClick={() => {
                    setItem(t)
                    setUnits(DEFAULT_UNITS[t])
                    setSaved(null)
                  }}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                    activeItem === t ? 'border-[var(--accent-600)] bg-[var(--accent-50)] font-semibold' : 'border-line'
                  }`}
                >
                  <span>
                    {ITEMS[t].label}
                    {ITEMS[t].season === 'both' && (
                      <span className="ml-1 rounded bg-ink px-1 text-[10px] font-semibold text-white">DONO MAUSAM</span>
                    )}
                  </span>
                  <span className="text-xs text-ink-3">{inr(ITEMS[t].unitCostInr)}</span>
                </button>
              ))}
            </div>
            <label className="block">
              <span className="flex justify-between text-sm font-semibold">
                Kitne units <span className="tabular">{units}</span>
              </span>
              <input
                type="range"
                min={1}
                max={activeItem === 'sapling' ? 2000 : activeItem === 'cabin' ? 60 : 400}
                value={units}
                onChange={(e) => {
                  setUnits(Number(e.target.value))
                  setSaved(null)
                }}
                className="w-full accent-[var(--accent-600)]"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Donor</span>
              <input
                value={donor}
                onChange={(e) => setDonor(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line px-3 py-2"
              />
            </label>
            {activeItem === 'cabin' && (
              <p className="rounded-lg bg-paper p-3 text-sm text-ink-2">
                Cabin ek hi investment se dono mausam sambhalta hai, isliye ye un guard posts ko jaata hai jo{' '}
                <b className="text-ink">garmi aur sardi dono</b> mein kharab hain (dono zarooraton ka geometric mean).
              </p>
            )}
            <button
              type="button"
              disabled={!plan.length || saving || !donor.trim()}
              onClick={approve}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 font-semibold text-white disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
              Plan approve karo ({plan.length} jagah)
            </button>
            {saved != null && <p className="text-sm text-good">{saved} deliveries plan ho gayi. Pulse page pe check karein.</p>}
            {planned.length > 0 && (
              <button
                type="button"
                onClick={markDelivered}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold"
              >
                <CheckCheck className="size-4" /> {planned.length} planned ko "delivered" mark karo
              </button>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Log covered" value={people.toLocaleString('en-IN')} sub={`${plan.length} jagah`} />
            <Stat label="Kharcha" value={inr(planCost(plan))} sub={`${inr(spec.unitCostInr)} / unit`} />
            <Stat
              label="Zyada-zaroorat wale log"
              value={highNeed(plan).toLocaleString('en-IN')}
              sub={`"jo pehle aaya" mein: ${highNeed(baseline).toLocaleString('en-IN')}`}
            />
            <Stat
              label="Need-weighted reach"
              value={baseReach > 0 ? `${(reach / baseReach).toFixed(1)}×` : '—'}
              sub='"jo pehle aaya" ke muqable'
              tone="text-good"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-line">
            <MapView className="relative h-[380px]" layers={layers} center={city.meta.center} zoom={11.8} />
            <div className="flex flex-wrap gap-4 border-t border-line bg-white px-4 py-2 text-xs text-ink-2">
              <span className="flex items-center gap-1.5">
                <span className={`inline-block size-3 rounded-full ${season === 'sardi' ? 'bg-sardi-600' : 'bg-garmi-600'}`} />
                Barahmasa plan (bada = zyada units)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-full border-2 border-ink-3" /> "Jo pehle aaya" (aaj ka tareeka)
              </span>
              <span className="flex items-center gap-1.5">
                <Scale className="size-3.5" aria-hidden /> Same units, sirf targeting alag
              </span>
            </div>
          </div>

          <Card title={`Allocation list (${plan.length})`}>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-ink-3">
                  <tr>
                    <th className="py-1 pr-2">Jagah</th>
                    <th className="py-1 pr-2 text-right">Units</th>
                    <th className="py-1 pr-2 text-right">Log</th>
                    <th className="py-1">Kyun</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((a) => (
                    <tr key={`${a.h3}-${a.name}-${a.lat}`} className="border-t border-line align-top">
                      <td className="py-1.5 pr-2 font-medium">{a.name}</td>
                      <td className="py-1.5 pr-2 text-right tabular">{a.qty}</td>
                      <td className="py-1.5 pr-2 text-right tabular">{a.people}</td>
                      <td className="py-1.5 text-ink-2">{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
