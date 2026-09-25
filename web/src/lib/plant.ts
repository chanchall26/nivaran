/**
 * Where to plant: which spots need greening most, what to plant there, and what it would change.
 *
 *   score = 100 x (0.45 heat need + 0.30 air need + 0.25 people who stay)
 *   heat need  hours at "Get ready" or worse during the day shift on LAST SUMMER's hottest day
 *              (trees are planted for years, not for today), times how much a new tree adds:
 *              a street with no shade gains about 1.5-2x more cooling than one that has some
 *   air need   traffic next to the spot (busy 1, some 0.55, quiet 0.15)
 *   people     everyone who stays there, on a log scale (150 or more = 1)
 *   evidence   ESA WorldCover 2021 around each point (data/cover): a hard hot surface (built-up
 *              60%+ within 30 m) adds 15% to heat need; a dusty edge (bare ground 15%+ within
 *              50 m) adds 0.15 to air need. Satellite tree cover is shown, not used to override
 *              the reviewed shade value (roofs and arcades give shade too; small trees are missed).
 *
 * What to plant follows the street, because heat and pollution need different planting:
 *   narrow lane with traffic  -> a dense hedge under 2 m, not big dense trees (they trap
 *                                traffic smoke in a street canyon)
 *   open, busy road           -> both: hedge on the road side, shade trees behind it
 *   open place, little traffic -> shade trees
 *   cold desert (Leh)         -> windbreak rows against night wind and dust, planted in spring
 * Every "after" is a range and is labelled Estimated.
 */
import type { Point } from './points'
import { heatLevel, type Climate, type Day } from './risk'
import { windChill } from './thermal'

export type PlantKind = 'trees' | 'hedge' | 'both' | 'windbreak'
export type Species = 'neem' | 'peepal' | 'jamun' | 'arjun' | 'kamini' | 'kaner' | 'gudhal' | 'willow' | 'poplar' | 'seabuckthorn'
export const SPECIES: Record<'trees' | 'hedge' | 'windbreak', Species[]> = {
  trees: ['neem', 'peepal', 'jamun', 'arjun'],
  hedge: ['kamini', 'kaner', 'gudhal'],
  windbreak: ['willow', 'poplar', 'seabuckthorn'],
}
export const speciesFor = (k: PlantKind): Species[] => (k === 'both' ? [...SPECIES.hedge, ...SPECIES.trees] : SPECIES[k])

/** How much a new tree adds where there is no / some / good shade already. */
const SHADE_GAIN = { none: 1, some: 0.6, good: 0.25 } as const
const TRAFFIC = { busy: 1, some: 0.55, quiet: 0.15 } as const
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Day shift, for heat: 8 am to 8 pm. The sun is strong enough for shade to matter from 10 am to 5 pm. */
const DAY_SHIFT = (h: number) => h >= 8 && h < 20
const SUN = (h: number) => h >= 10 && h <= 16

/** Land cover around a point (shares 0..1), from pipeline/build_cover.py. */
export interface Cover {
  trees50: number
  built30: number
  bare50: number
}
export const HARD = 0.6
export const DUSTY = 0.15

export interface PlantSite {
  point: Point
  score: number
  parts: { heat: number; air: number; people: number }
  kind: PlantKind
  /** no shade now: plant here first */
  first: boolean
  busy: boolean
  /** hours at "Get ready" or worse in the day shift on the hottest day */
  hotHours: number
  /** hottest hour of that day's afternoon, for "Hot at 2 pm" */
  peakHour: number | null
  staying: number
  /** satellite evidence, when there is cover data for this point */
  cover: Cover | null
  hard: boolean
  dusty: boolean
}

export function kindFor(p: Point, climate: Climate): PlantKind {
  if (climate === 'cold_desert') return 'windbreak'
  const traffic = p.traffic ?? 'some'
  if (p.street === 'narrow' && traffic !== 'quiet') return 'hedge'
  if (traffic === 'busy') return 'both'
  return 'trees'
}

export function dangerousHours(d: Day) {
  return d.hours.filter((h) => DAY_SHIFT(h.hour) && heatLevel(h.feels) >= 2).length
}

export function plantSites(points: Point[], hottest: Day | null, climate: Climate, covers: Record<string, Cover> = {}): PlantSite[] {
  return points
    .map((p) => {
      const shade = p.shadeNow ?? 'some'
      const dayPeople = p.people.filter((c) => c.shift === 'day').reduce((a, c) => a + c.count, 0)
      const staying = p.people.reduce((a, c) => a + c.count, 0)
      const hotHours = hottest ? dangerousHours(hottest) : 0
      let peakHour: number | null = null
      if (hottest) {
        const aft = hottest.hours.filter((h) => h.hour >= 10 && h.hour <= 17)
        if (aft.length) peakHour = aft.reduce((a, b) => (b.feels > a.feels ? b : a)).hour
      }
      const cover = covers[p.id] ?? null
      const hard = !!cover && cover.built30 >= HARD
      const dusty = !!cover && cover.bare50 >= DUSTY
      // no one out in the day: shade helps less (the night crew still gets a cooler evening)
      const heat = clamp01((hottest ? clamp01(hotHours / 8) : 0.5) * SHADE_GAIN[shade] * (dayPeople > 0 ? 1 : 0.3) * (hard ? 1.15 : 1))
      const air = clamp01(TRAFFIC[p.traffic ?? 'some'] + (dusty ? 0.15 : 0))
      const people = clamp01(Math.log1p(staying) / Math.log1p(150))
      return {
        point: p,
        score: Math.round(100 * (0.45 * heat + 0.3 * air + 0.25 * people)),
        parts: { heat, air, people },
        kind: kindFor(p, climate),
        first: shade === 'none' && climate !== 'cold_desert',
        busy: p.traffic === 'busy',
        hotHours, peakHour, staying, cover, hard, dusty,
      }
    })
    .sort((a, b) => b.score - a.score)
}

// ---------- what if we do this? ----------

const SHADE_SCALE = { none: 1, some: 0.6, good: 0.3 } as const

/** The day with the sunny hours cooled by `by` degrees (feels-like). */
export function cooledDay(d: Day, by: number): Day {
  const hours = d.hours.map((h) => (SUN(h.hour) ? { ...h, feels: h.feels - by } : h))
  const feels = hours.map((h) => h.feels)
  return { ...d, hours, fmax: Math.max(...feels), fmin: Math.min(...feels) }
}

/**
 * Shade over the spot: the sunny hours feel 4-8° cooler (less where there is some shade already).
 * Dangerous hours on the hottest day, before and after, as a range.
 */
export function shadeWhatIf(d: Day, shadeNow: Point['shadeNow'] = 'some') {
  const s = SHADE_SCALE[shadeNow]
  const lo = Math.round(4 * s * 10) / 10
  const hi = Math.round(8 * s * 10) / 10
  return {
    lo, hi,
    before: dangerousHours(d),
    best: dangerousHours(cooledDay(d, hi)),
    worst: dangerousHours(cooledDay(d, lo)),
    middle: cooledDay(d, (lo + hi) / 2),
  }
}

/** A dense hedge under 2 m by the road: 10-25% less dust (PM10) behind it. */
export function hedgeWhatIf(pm10: number) {
  return { now: Math.round(pm10), lo: Math.round(pm10 * 0.75), hi: Math.round(pm10 * 0.9) }
}

/** Windbreak rows: behind them the wind can drop by up to half; what that does to tonight's wind chill. */
export function windbreakWhatIf(tempMin: number, windKmh: number) {
  const now = windChill(tempMin, windKmh)
  const after = windChill(tempMin, windKmh * 0.5)
  return { now: Math.round(now), after: Math.round(after), calm: windKmh < 8 }
}
