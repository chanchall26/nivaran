import { describe, expect, it } from 'vitest'
import { WHATIF } from '../i18n/whatif'
import { dangerousHours } from './plant'
import type { Point } from './points'
import { indianAqi, type Day, type Hour } from './risk'
import { airWhatIf, hedgeCut, heatWhatIf, peopleHelped, pickHeatDay, STARTS, LEVERS } from './whatif'

const hour = (h: number, over: Partial<Hour> = {}): Hour => ({
  time: `2026-06-11T${String(h).padStart(2, '0')}:00`, hour: h, temp: 30, feels: 30, rh: 30, rainProb: 0, rain: 0, wind: 8,
  pm25: 30, pm10: 60, aqi: null, ...over,
})
const day = (f: (h: number) => Partial<Hour>): Day => {
  const hours = Array.from({ length: 24 }, (_, h) => hour(h, f(h)))
  const feels = hours.map((x) => x.feels)
  return { date: '2026-06-11', hours, tmax: 40, tmin: 28, fmax: Math.max(...feels), fmin: Math.min(...feels), rainProbMax: 0, rainSum: 0, aqi: null }
}
const point = (over: Partial<Point> = {}): Point => ({
  id: 'p', name: 'P', nameHi: 'पी', lat: 0, lon: 0, type: 'market', ward: '', wardHi: '',
  people: [{ group: 'vendor', count: 40, shift: 'day' }, { group: 'guard', count: 2, shift: 'night' }], ...over,
})

describe('what if: heat', () => {
  // a hot afternoon: 42-45° feels-like from 10 am to 5 pm
  const hot = day((h) => ({ feels: h >= 10 && h <= 16 ? 42 + (h % 3) : 30 }))
  it('shade gives a range of dangerous hours, never more than now', () => {
    const r = heatWhatIf(hot, 'none')
    expect(r.drop).toEqual([4, 8])
    expect(r.before).toBe(dangerousHours(hot))
    expect(r.after[0]).toBeLessThanOrEqual(r.after[1])
    expect(r.after[1]).toBeLessThanOrEqual(r.before)
    expect(r.after[0]).toBeLessThan(r.before)
  })
  it('less cooling where there is some shade already', () => {
    expect(heatWhatIf(hot, 'some').drop[1]).toBeLessThan(8)
  })
  it("uses last summer's hottest day when the day shown is not hot", () => {
    const mild = day(() => ({ feels: 26 }))
    expect(pickHeatDay(mild, hot)?.source).toBe('summer')
    expect(pickHeatDay(hot, mild)?.source).toBe('shown')
    expect(pickHeatDay(mild, null)?.source).toBe('shown')
  })
})

describe('what if: air', () => {
  it('a hedge cuts PM10 10-25% on an open road, 5-20% in a narrow street', () => {
    expect(hedgeCut('open')).toEqual([0.1, 0.25])
    expect(hedgeCut('narrow')).toEqual([0.05, 0.2])
  })
  it('dusty day (PM10 sets the AQI): the AQI near the road improves, as a range', () => {
    const dusty = day(() => ({ pm25: 40, pm10: 300 }))
    const r = airWhatIf(dusty, 'open')!
    expect(r.main).toBe('pm10')
    expect(r.aqi).toBe(indianAqi(40, 300))
    expect(r.pm10After).toEqual([225, 270])
    expect(r.aqiAfter![0]).toBeLessThan(r.aqiAfter![1])
    expect(r.aqiAfter![1]).toBeLessThan(r.aqi)
  })
  it('smoky day (PM2.5 sets the AQI): no AQI promise, only the PM10 range', () => {
    const smoky = day(() => ({ pm25: 160, pm10: 180 }))
    const r = airWhatIf(smoky, 'narrow')!
    expect(r.main).toBe('pm25')
    expect(r.aqiAfter).toBeNull()
    expect(r.pm10After[0]).toBeLessThan(r.pm10After[1])
  })
  it('no air data, no numbers', () => {
    expect(airWhatIf(day(() => ({ pm25: null, pm10: null })))).toBeNull()
  })
})

describe('what if: people and time', () => {
  it('shade helps the day crew; a hedge helps everyone who stays', () => {
    expect(peopleHelped(point(), ['canopy'])).toBe(40)
    expect(peopleHelped(point(), ['hedge'])).toBe(42)
    expect(peopleHelped(point(), ['trees', 'hedge'])).toBe(42)
    expect(peopleHelped(null, ['hedge'])).toBeNull()
  })
  it('every choice says when it starts working', () => {
    for (const l of LEVERS) expect(WHATIF.en.time[STARTS[l]!]).toBeTruthy()
  })
})

describe('what if: Hindi and English have the same words', () => {
  const walk = (a: unknown, b: unknown, path: string, out: string[]) => {
    if (typeof a === 'string') {
      if (typeof b !== 'string') return out.push(`${path}: missing`)
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
      if (ph(a) !== ph(b)) out.push(`${path}: placeholders differ`)
      return
    }
    for (const k of Object.keys(a as object)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)?.[k], `${path}.${k}`, out)
  }
  it('every key and placeholder matches', () => {
    const out: string[] = []
    walk(WHATIF.en, WHATIF.hi, 'whatif', out)
    expect(out).toEqual([])
  })
  it('Hindi is in Devanagari', () => {
    for (const s of [WHATIF.hi.title, WHATIF.hi.note, WHATIF.hi.levers.hedge, WHATIF.hi.pm25Main]) expect(s).toMatch(/[ऀ-ॿ]/)
  })
})
