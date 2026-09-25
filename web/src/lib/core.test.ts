import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeLedger } from './impact'
import { allocate, ITEMS } from './match'
import { STRINGS } from '../i18n/strings'
import { allowedSpecies, byId, reasonKeys, recommend, ruleVerdict } from './species'
import { actionKey, heaterMonthlyCost, parsePulseRules, routeFor } from './policy'
import { alaav, band, chhaya, computeNorms, exposure, nightCold, smokeTrap } from './scoring'
import type { Cell, Delivery, HourlyWeather, Place, WeatherSummary } from './types'
import { summarise, typical } from './weather'

const data = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../public/data/gwalior', f), 'utf-8'))
const cells: Cell[] = data('cells.json')
const places: Place[] = data('places.json')
const replay = data('replay.json')
const norms = computeNorms(cells)

const coldNight: WeatherSummary = summarise(replay.sardi.hourly as HourlyWeather, {
  source: 'replay', label: 'cold', nightOf: '2026-01-05', dayOf: '2026-01-05',
})
const warmNight: WeatherSummary = { ...typical(), nightMinFeels: 22, ventilation: 3000 }

describe('weather summary', () => {
  it('picks up the 5-6 Jan 2026 smoke-trap night', () => {
    expect(coldNight.nightMinFeels).toBeLessThan(7)
    expect(coldNight.ventilation).toBeLessThan(100)
    expect(smokeTrap(coldNight)).toBe(1)
    expect(nightCold(coldNight)).toBeGreaterThan(0.75)
  })
})

describe('scores', () => {
  it('stay within 0-100 for every cell in both seasons', () => {
    for (const c of cells) {
      for (const b of [chhaya(c, norms, typical()), alaav(c, norms, coldNight)]) {
        expect(b.score).toBeGreaterThanOrEqual(0)
        expect(b.score).toBeLessThanOrEqual(100)
      }
    }
  })

  it('a warm night means no Alaav need anywhere', () => {
    const worst = Math.min(...cells.map((c) => alaav(c, norms, warmNight).score))
    expect(worst).toBe(100)
  })

  it('the cold night produces a real spread, with the busiest cells worst', () => {
    const scored = cells.map((c) => ({ c, s: alaav(c, norms, coldNight).score })).sort((a, b) => a.s - b.s)
    expect(scored[0].s).toBeLessThan(40)
    expect(scored.at(-1)!.s).toBeGreaterThan(85)
    expect(exposure(scored[0].c, norms)).toBeGreaterThan(exposure(scored.at(-1)!.c, norms))
  })

  it('shadier cells score better in garmi, all else equal', () => {
    const c = cells.find((x) => x.canopy != null && x.lst != null)!
    const bare = chhaya({ ...c, canopy: 0 }, norms, typical()).score
    const green = chhaya({ ...c, canopy: 0.35 }, norms, typical()).score
    expect(green).toBeGreaterThan(bare)
  })

  it('bands', () => {
    expect(band(10)).toBe('critical')
    expect(band(95)).toBe('ok')
  })
})

describe('Barahmasa Match', () => {
  const base = { cells, places, reports: [], norms, weather: coldNight, typicalWeather: typical() }

  it('never allocates more units than asked and only to allowed place kinds', () => {
    const plan = allocate({ ...base, item: 'heater', units: 50 })
    expect(plan.reduce((s, a) => s + a.qty, 0)).toBe(50)
    const kinds = ITEMS.heater.kinds as string[]
    for (const a of plan) expect(a.target.kind === 'place' && kinds.includes(a.target.place.kind)).toBe(true)
  })

  it('does not stack heaters beyond the people at a place', () => {
    const plan = allocate({ ...base, item: 'heater', units: 200 })
    for (const a of plan) {
      if (a.target.kind === 'place' && a.target.place.kind === 'guard_post')
        expect(a.qty * ITEMS.heater.covers).toBeLessThanOrEqual((a.target.place.staff ?? 1) + 1)
    }
  })

  it('saplings go to street cells with a canopy gap', () => {
    const plan = allocate({ ...base, weather: typical(), item: 'sapling', units: 100 })
    expect(plan.length).toBeGreaterThan(0)
    for (const a of plan) expect(a.target.kind).toBe('cell')
  })

  const reportsAt = (a: { lat: number; lon: number; h3: string }, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `r${i}`, season: 'sardi', category: 'homeless', route: 'shelter_outreach', lat: a.lat, lon: a.lon,
      h3: a.h3, facesBlurred: 0, peoplePresent: true, summary: '', status: 'open', createdAt: 0, ai: 'rules',
    })) as never

  it('reports cannot drag help away from much needier places (smartphone-bias guard)', () => {
    const top = allocate({ ...base, item: 'warm_kit', units: 1 })[0]
    const lowest = allocate({ ...base, item: 'warm_kit', units: 400 }).at(-1)!
    expect(top.need - lowest.need).toBeGreaterThan(0.15)
    const withReports = allocate({ ...base, item: 'warm_kit', units: 1, reports: reportsAt(lowest, 5) })[0]
    expect(withReports.h3).toBe(top.h3)
  })

  it('reports do break near-ties', () => {
    const all = allocate({ ...base, item: 'warm_kit', units: 400 })
    const top = all[0]
    const close = all.find((a) => a.h3 !== top.h3 && top.need - a.need > 0.01 && top.need - a.need < 0.1)!
    expect(close).toBeTruthy()
    const withReports = allocate({ ...base, item: 'warm_kit', units: 1, reports: reportsAt(close, 3) })[0]
    expect(withReports.h3).toBe(close.h3)
  })
})

describe('policy', () => {
  it('never routes people to enforcement', () => {
    expect(routeFor('waste_only', true)).not.toBe('municipal_cleanup')
    expect(routeFor('waste_only', false)).toBe('municipal_cleanup')
    expect(routeFor('guard_fire', true)).toBe('rwa_heater')
  })

  it('understands common Hinglish / Hindi pulse answers', () => {
    expect(parsePulseRules('haan ji, chala tha', 'heater')).toEqual({ ok: true, reason: 'none' })
    expect(parsePulseRules('nahi chalaya, RWA bijli bill se darti hai', 'heater').reason).toBe('electricity_bill')
    expect(parsePulseRules('नहीं, सेक्रेटरी ने मना कर दिया', 'heater').reason).toBe('rwa_refused')
    expect(parsePulseRules('paudha sookh gaya', 'sapling').reason).toBe('plant_died')
    expect(parsePulseRules('phone pe baat karo', 'heater').ok).toBe(false)
    expect(parsePulseRules('Yes, it ran all night', 'heater').ok).toBe(true)
    expect(parsePulseRules('No, society says the electricity bill will be high', 'heater').reason).toBe('electricity_bill')
    expect(parsePulseRules('The plant died', 'sapling').reason).toBe('plant_died')
    expect(parsePulseRules('नहीं, सॉकेट ही नहीं है', 'heater').reason).toBe('no_socket')
    expect(parsePulseRules('haan bhara tha', 'water_pot')).toEqual({ ok: true, reason: 'none' })
    expect(parsePulseRules('rain basera mein jagah nahi thi', 'warm_kit').reason).toBe('full')
    expect(heaterMonthlyCost()).toBe(1008)
    expect(actionKey('heater', 'broken')).toBe('brokenHeater')
  })
})

describe('ledger', () => {
  it('computes active rate and keeps estimates as ordered ranges', () => {
    const d = (status: Delivery['status'], item: Delivery['item'] = 'heater'): Delivery => ({
      id: Math.random().toString(), item, qty: 1, h3: 'x', lat: 0, lon: 0, placeName: '', donor: '', status,
      createdAt: 0, people: 2,
    })
    const l = computeLedger([d('working'), d('working'), d('working'), d('not_working'), d('delivered')], [], [])
    expect(l.heaterActiveRate).toBeCloseTo(0.75)
    expect(l.pm25AvoidedKg.low).toBeLessThan(l.pm25AvoidedKg.high)
  })
})

describe('people-first scoring', () => {
  it('an empty, bare, hot field is a planting opportunity, not an emergency', () => {
    const c = cells.find((x) => x.lst != null)!
    const empty = { ...c, pop: 0, exposed: 0, roadKm: 0, canopy: 0, lst: norms.lstHi }
    const busy = { ...empty, pop: norms.popP95, exposed: norms.exposedP95, roadKm: norms.roadP95 }
    const hotDay = { ...typical(), dayMaxFeels: 46 }
    expect(chhaya(empty, norms, hotDay).score).toBeGreaterThanOrEqual(60)
    expect(chhaya(busy, norms, hotDay).score).toBeLessThan(10)
    expect(alaav(empty, norms, coldNight).score).toBe(100)
  })
})

describe('i18n', () => {
  const walk = (o: unknown, path = ''): [string, string][] =>
    typeof o === 'string'
      ? [[path, o]]
      : Array.isArray(o)
        ? o.flatMap((v, i) => walk(v, `${path}[${i}]`))
        : Object.entries(o as object).flatMap(([k, v]) => walk(v, path ? `${path}.${k}` : k))
  const en = new Map(walk(STRINGS.en))
  const hi = new Map(walk(STRINGS.hi))

  it('Hindi has every English string, none empty', () => {
    expect([...hi.keys()].sort()).toEqual([...en.keys()].sort())
    for (const [k, v] of hi) expect(v.trim(), k).not.toBe('')
  })

  it('placeholders match in both languages', () => {
    const ph = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [k, v] of en) expect(ph(hi.get(k)!), k).toEqual(ph(v))
  })
})

describe('species advisor', () => {
  const base = { wires: false, space: 'wide' as const, paved: false, water: true, crowded: false }

  it('never puts a tall tree under wires, even when wires are only "not sure"', () => {
    for (const wires of [true, null]) {
      const picks = recommend({ ...base, wires })
      expect(picks.length).toBeGreaterThan(0)
      for (const id of picks) expect(byId.get(id)!.maxH).toBeLessThanOrEqual(8)
    }
    expect(reasonKeys({ ...base, wires: null })).toContain('wiresUnsure')
  })

  it('narrow strips and no-water spots get only fitting species', () => {
    for (const s of allowedSpecies({ ...base, space: 'narrow', water: false })) {
      expect(s.narrowOk).toBe(true)
      expect(s.water).toBe('low')
    }
    expect(allowedSpecies({ ...base, space: 'medium' }).some((s) => s.wideOnly)).toBe(false)
  })

  it('open ground with water gets a dense shade tree first; crowded lanes prefer open crowns', () => {
    expect(byId.get(recommend(base)[0])!.shade).toBe(3)
    expect(byId.get(recommend({ ...base, crowded: true, wires: true })[0])!.openCrown).toBe(true)
  })

  it('verdicts', () => {
    expect(ruleVerdict(base)).toBe('yes')
    expect(ruleVerdict({ ...base, paved: true })).toBe('maybe')
    expect(ruleVerdict({ ...base, space: 'narrow', paved: true, water: false })).toBe('no')
  })
})
