import { describe, expect, it } from 'vitest'
import { cooledDay, dangerousHours, hedgeWhatIf, kindFor, plantSites, shadeWhatIf, windbreakWhatIf } from './plant'
import type { Point } from './points'
import type { Day, Hour } from './risk'

const hour = (h: number, feels: number): Hour => ({
  time: `2026-06-11T${String(h).padStart(2, '0')}:00`, hour: h, temp: feels, feels, rh: 20, rainProb: 0, rain: 0, wind: 8, pm25: 40, pm10: 120, aqi: 100,
})
// a Gwalior-like hottest day: 44-46° feels-like from 11 to 5
const hottest: Day = (() => {
  const hours = Array.from({ length: 24 }, (_, h) => hour(h, h >= 11 && h <= 17 ? 45 : h >= 8 && h <= 19 ? 39 : 31))
  return { date: '2026-06-11', hours, tmax: 45, tmin: 31, fmax: 45, fmin: 31, rainProbMax: 0, rainSum: 0, aqi: 100 }
})()
const base: Point = { id: 'x', name: 'X', nameHi: 'एक्स', lat: 0, lon: 0, type: 'market', ward: 'A', wardHi: 'ए', people: [{ group: 'vendor', count: 30, shift: 'day' }] }

describe('what to plant follows the street', () => {
  it('open square with people in the sun: shade trees', () => {
    expect(kindFor({ ...base, street: 'open', traffic: 'quiet' }, 'plains')).toBe('trees')
  })
  it('narrow busy lane: a low dense hedge, not big dense trees', () => {
    expect(kindFor({ ...base, street: 'narrow', traffic: 'busy' }, 'plains')).toBe('hedge')
  })
  it('open busy road: both, hedge by the road and trees behind', () => {
    expect(kindFor({ ...base, street: 'open', traffic: 'busy' }, 'plains')).toBe('both')
  })
  it('Leh: windbreak rows', () => {
    expect(kindFor({ ...base, street: 'open', traffic: 'busy' }, 'cold_desert')).toBe('windbreak')
  })
})

describe('where first', () => {
  it('a street with no shade and more people scores above a shaded, quiet one', () => {
    const [a, b] = plantSites(
      [
        { ...base, id: 'shaded', street: 'open', traffic: 'quiet', shadeNow: 'good', people: [{ group: 'vendor', count: 5, shift: 'day' }] },
        { ...base, id: 'bare', street: 'open', traffic: 'busy', shadeNow: 'none' },
      ],
      hottest, 'plains',
    )
    expect(a.point.id).toBe('bare')
    expect(a.first).toBe(true)
    expect(a.score).toBeGreaterThan(b.score)
    expect(a.peakHour).toBe(11)
  })
})

describe('satellite evidence', () => {
  it('a hard hot surface raises heat need and a dusty edge raises air need; tree cover is shown, not used to override shade', () => {
    const p: Point = { ...base, street: 'open', traffic: 'some', shadeNow: 'some' }
    const [plain] = plantSites([p], hottest, 'plains')
    const [withCover] = plantSites([p], hottest, 'plains', { x: { trees50: 0, built30: 0.9, bare50: 0.3 } })
    expect(withCover.hard && withCover.dusty).toBe(true)
    expect(withCover.parts.heat).toBeGreaterThan(plain.parts.heat)
    expect(withCover.parts.air).toBeCloseTo(plain.parts.air + 0.15, 5)
    expect(withCover.first).toBe(plain.first)
    expect(plain.cover).toBeNull()
  })
})

describe('what if we do this?', () => {
  it('shade: dangerous hours on the hottest day fall, as a range', () => {
    const w = shadeWhatIf(hottest, 'none')
    expect([w.lo, w.hi]).toEqual([4, 8])
    expect(w.before).toBe(dangerousHours(hottest))
    expect(w.best).toBeLessThanOrEqual(w.worst)
    expect(w.worst).toBeLessThan(w.before)
  })
  it('only the sunny hours are cooled', () => {
    const c = cooledDay(hottest, 6)
    expect(c.hours[20].feels).toBe(hottest.hours[20].feels)
    expect(c.hours[13].feels).toBe(hottest.hours[13].feels - 6)
  })
  it('hedge: 10-25% less dust behind it', () => {
    expect(hedgeWhatIf(200)).toEqual({ now: 200, lo: 150, hi: 180 })
  })
  it('windbreak: half the wind makes a cold windy night feel warmer', () => {
    const w = windbreakWhatIf(0, 20)
    expect(w.after).toBeGreaterThan(w.now)
    expect(windbreakWhatIf(0, 4).calm).toBe(true)
  })
})
