/**
 * "What if we do this?" (Brief 2, section 5): planning ranges for greening and quick fixes.
 * Every "after" is a range, never one number, and is labelled Estimated in the UI.
 *
 *   Shade trees or a canopy over a waiting spot: the sunny hours feel 4-8° cooler (WRI 2026:
 *     a shaded footpath can feel up to 8° cooler; the air itself changes about 1°). Less where
 *     there is some shade already (lib/plant.ts shadeWhatIf).
 *   A dense hedge under 2 m by the road: dust (PM10) right behind it is 10-25% lower on an open
 *     busy road, 5-20% in a narrow street (US EPA field studies: up to about 30%). Fine smoke
 *     (PM2.5) may not change, so the AQI only moves when PM10 is the main pollutant.
 *   Stopping garbage burning and watering a dusty road have no number: high impact on smoky
 *     nights / medium, for a few hours.
 */
import { dangerousHours, shadeWhatIf } from './plant'
import type { Point } from './points'
import { indianAqi, pm10Index, pm25Index, type Day } from './risk'

export type Lever = 'trees' | 'canopy' | 'hedge' | 'burning' | 'water'
export const LEVERS: Lever[] = ['trees', 'canopy', 'hedge', 'burning', 'water']
export type Range = [number, number]

/** Share of PM10 a dense hedge removes right behind it. */
export const hedgeCut = (street: Point['street'] | undefined): Range => (street === 'narrow' ? [0.05, 0.2] : [0.1, 0.25])

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export interface AirWhatIf {
  /** the day's mean concentrations, as the gauge uses (CPCB 24-hour method) */
  pm25: number
  pm10: number
  /** which pollutant sets the AQI now */
  main: 'pm10' | 'pm25'
  aqi: number
  cut: Range
  /** PM10 right behind the hedge, µg/m³: [with the bigger cut, with the smaller cut] */
  pm10After: Range
  /** the AQI near the road: only when PM10 is the main pollutant */
  aqiAfter: Range | null
}

export function airWhatIf(day: Day, street?: Point['street']): AirWhatIf | null {
  const pm25 = mean(day.hours.map((h) => h.pm25))
  const pm10 = mean(day.hours.map((h) => h.pm10))
  if (pm25 == null || pm10 == null) return null
  const aqi = indianAqi(pm25, pm10)
  if (aqi == null) return null
  const cut = hedgeCut(street)
  const pm10After: Range = [pm10 * (1 - cut[1]), pm10 * (1 - cut[0])]
  const main = (pm10Index(pm10) ?? 0) > (pm25Index(pm25) ?? 0) ? 'pm10' : 'pm25'
  const aqiAfter: Range | null = main === 'pm10' ? [indianAqi(pm25, pm10After[0]) ?? aqi, indianAqi(pm25, pm10After[1]) ?? aqi] : null
  return { pm25, pm10, main, aqi, cut, pm10After, aqiAfter }
}

export interface HeatWhatIf {
  /** feels-like drop in the sunny hours, °C */
  drop: Range
  before: number
  /** dangerous hours after: [with the bigger drop, with the smaller drop] */
  after: Range
  /** the day redrawn with the middle of the drop, for the After strip */
  middle: Day
}

export function heatWhatIf(day: Day, shadeNow: Point['shadeNow'] = 'none'): HeatWhatIf {
  const s = shadeWhatIf(day, shadeNow)
  return { drop: [s.lo, s.hi], before: s.before, after: [s.best, s.worst], middle: s.middle }
}

/** The day to show heat on: the day on screen if it has dangerous hours, else last summer's hottest. */
export function pickHeatDay(shown: Day | null, hottest: Day | null): { day: Day; source: 'shown' | 'summer' } | null {
  if (shown && dangerousHours(shown) > 0) return { day: shown, source: 'shown' }
  if (hottest) return { day: hottest, source: 'summer' }
  return shown ? { day: shown, source: 'shown' } : null
}

/** People helped per day at the spot: shade helps the day crew; the rest helps everyone there. */
export function peopleHelped(p: Point | null, levers: Lever[]): number | null {
  if (!p) return null
  const all = p.people.reduce((a, c) => a + c.count, 0)
  const day = p.people.filter((c) => c.shift === 'day').reduce((a, c) => a + c.count, 0)
  if (!levers.length) return null
  return levers.every((l) => l === 'trees' || l === 'canopy') ? day : all
}

/** When each choice starts working. */
export const STARTS: Partial<Record<Lever, 'week' | 'hedge' | 'trees' | 'tonight' | 'hours'>> = {
  canopy: 'week',
  hedge: 'hedge',
  trees: 'trees',
  burning: 'tonight',
  water: 'hours',
}
