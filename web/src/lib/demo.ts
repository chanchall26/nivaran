/**
 * Demo season: runs the real Match engine, then simulates a winter + summer of Pulse
 * answers and reports so the Ledger has something to show. Every row carries demo:true
 * and can be removed with one click. Rates are chosen to be plausible, not flattering.
 */
import { cellToLatLng } from 'h3-js'
import { actionFor, routeFor } from './policy'
import { allocate, ITEMS, type Allocation } from './match'
import type { Norms } from './scoring'
import { store } from './store'
import type { Cell, Delivery, ItemType, Place, PulseCheck, PulseReason, Report, ReportCategory, WeatherSummary } from './types'

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const PLAN: { item: ItemType; units: number; okRate: number; reasons: [PulseReason, number][] }[] = [
  { item: 'heater', units: 90, okRate: 0.84, reasons: [['electricity_bill', 0.5], ['rwa_refused', 0.3], ['broken', 0.2]] },
  { item: 'warm_kit', units: 160, okRate: 0.9, reasons: [['not_received', 0.5], ['stolen', 0.5]] },
  { item: 'cabin', units: 12, okRate: 0.92, reasons: [['broken', 1]] },
  { item: 'shade_net', units: 25, okRate: 0.8, reasons: [['stolen', 0.6], ['broken', 0.4]] },
  { item: 'water_pot', units: 40, okRate: 0.7, reasons: [['no_water', 1]] },
  { item: 'sapling', units: 400, okRate: 0.77, reasons: [['plant_died', 0.7], ['no_water', 0.3]] },
]

const ANSWERS: Record<PulseReason, string> = {
  none: 'Haan ji, sab theek hai',
  electricity_bill: 'Nahi chala, society wale bolte hain bijli ka bill badh jaayega',
  rwa_refused: 'Secretary sahab ne mana kar diya',
  broken: 'Kharab ho gaya, chal nahi raha',
  stolen: 'Koi le gaya',
  no_water: 'Paani nahi mil raha',
  plant_died: 'Paudha sookh gaya',
  not_received: 'Abhi tak mila hi nahi',
  other: 'Pata nahi',
}

export async function seedDemo(opts: {
  cells: Cell[]
  places: Place[]
  norms: Norms
  coldNight: WeatherSummary
  typicalWeather: WeatherSummary
}) {
  const r = rng(42)
  const now = Date.now()
  const day = 86_400_000
  const deliveries: Omit<Delivery, 'id'>[] = []

  for (const p of PLAN) {
    const spec = ITEMS[p.item]
    const weather = spec.season === 'sardi' ? opts.coldNight : opts.typicalWeather
    const plan: Allocation[] = allocate({
      item: p.item, units: p.units, cells: opts.cells, places: opts.places, reports: [],
      norms: opts.norms, weather, typicalWeather: opts.typicalWeather,
    })
    const deliveredAt = now - (spec.season === 'sardi' ? 200 : 110) * day
    for (const a of plan) {
      const [lat, lon] = a.target.kind === 'place' ? [a.lat, a.lon] : cellToLatLng(a.h3)
      const ok = r() < p.okRate
      let reason: PulseReason = 'none'
      if (!ok) {
        let x = r()
        for (const [k, w] of p.reasons) {
          if ((x -= w) <= 0) {
            reason = k
            break
          }
        }
        if (reason === 'none') reason = p.reasons[0][0]
      }
      const status: Delivery['status'] =
        p.item === 'sapling' ? (reason === 'plant_died' || reason === 'stolen' ? 'dead' : 'alive') : ok ? 'working' : 'not_working'
      deliveries.push({
        item: p.item, qty: a.qty, placeId: a.target.kind === 'place' ? a.target.place.id : undefined, h3: a.h3, lat, lon,
        placeName: a.name, donor: p.item === 'sapling' || p.item === 'cabin' ? 'Demo Green CSR' : 'Demo CSR Foundation',
        status, createdAt: deliveredAt - 3 * day, deliveredAt, lastPulseAt: deliveredAt + 30 * day,
        lastReason: reason, people: a.people, demo: true,
      })
    }
  }
  await store.addMany('deliveries', deliveries)

  // pulses must reference delivery ids, so read them back
  const saved = await new Promise<Delivery[]>((resolve) => {
    const unsub = store.subscribe('deliveries', (rows) => {
      const demo = (rows as Delivery[]).filter((d) => d.demo)
      if (demo.length >= deliveries.length) {
        setTimeout(() => unsub(), 0)
        resolve(demo)
      }
    })
  })
  const pulses: Omit<PulseCheck, 'id'>[] = saved.map((d) => {
    const reason = d.lastReason ?? 'none'
    return {
      deliveryId: d.id, question: '', answer: ANSWERS[reason], ok: reason === 'none', reason,
      action: actionFor(d.item, reason), createdAt: d.lastPulseAt ?? now, ai: 'rules', demo: true,
    }
  })
  await store.addMany('pulses', pulses)

  // reports: weighted towards exposed cells, both seasons, most resolved
  const hot = [...opts.cells].sort((a, b) => b.exposed - a.exposed).slice(0, 120)
  const cats: [Report['season'], ReportCategory, boolean][] = [
    ['sardi', 'guard_fire', true], ['sardi', 'guard_fire', true], ['sardi', 'homeless', true],
    ['sardi', 'labour_camp', true], ['sardi', 'waste_only', false], ['garmi', 'heat_exposed', true],
    ['garmi', 'no_shade_spot', false], ['garmi', 'heat_exposed', true],
  ]
  const summaries: Record<ReportCategory, string> = {
    guard_fire: 'Gate ke paas guard patte jala ke garmi le raha hai',
    homeless: 'Footpath pe kuch log bina kambal ke',
    labour_camp: 'Nirmaan site ke paas jhuggi mein aag',
    waste_only: 'Khaali plot mein kachre ka dher sulag raha hai',
    heat_exposed: 'Thele wale dopahar ki dhoop mein, koi chhaaya nahi',
    no_shade_spot: 'Bus stop pe na shed na ped',
    other: 'Kuch aur',
  }
  const reports: Omit<Report, 'id'>[] = Array.from({ length: 48 }, (_, i) => {
    const c = hot[Math.floor(r() * hot.length)]
    const [season, category, people] = cats[i % cats.length]
    const createdAt = now - (season === 'sardi' ? 180 + r() * 60 : 100 + r() * 40) * day
    const resolved = r() < 0.72
    return {
      season, category, route: routeFor(category, people), lat: c.lat, lon: c.lon, h3: c.h3, facesBlurred: 0,
      peoplePresent: people, summary: summaries[category], status: resolved ? 'resolved' : 'open', createdAt,
      resolvedAt: resolved ? createdAt + (6 + r() * 66) * 3_600_000 : undefined, ai: 'rules', demo: true,
    }
  })
  await store.addMany('reports', reports)
  return { deliveries: deliveries.length, pulses: pulses.length, reports: reports.length }
}
