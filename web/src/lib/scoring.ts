/**
 * Barahmasa scoring. Transparent weighted formulas, no black box.
 *
 * Every score is 0-100 where LOW = MORE NEED (like American Forests' Tree Equity Score).
 * Internally we work with `need` in 0..1 and report `score = round(100 * (1 - need))`.
 *
 *  Chhaya Score (garmi):  need = placeHeat x (0.3 + 0.7 exposure) x (0.4 + 0.6 dayHeat)
 *                         placeHeat = 0.5 canopyGap + 0.5 surfaceHeat
 *  Alaav Score (sardi):   need = exposure x (0.65 + 0.35 shelterGap) x nightCold x (0.75 + 0.25 smokeTrap)
 *
 * People are a multiplier, not an addend: an empty hot field is a planting opportunity,
 * not an emergency, and an empty cold field needs no heater.
 *  Smoke-Trap Index:      from the night's ventilation coefficient (BLH x wind).
 *
 * Structural inputs (canopy, LST, population, exposure) come from the pipeline; weather
 * inputs are city-wide (one forecast point), so they shift the whole city together while
 * the spatial pattern comes from the structural layers. This is stated in the UI.
 */
import type { Cell, Season, WeatherSummary } from './types'

export const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)
const ramp = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo))

/** Canopy share at which a cell counts as fully shaded (3-30-300 rule: 30 % canopy). */
export const CANOPY_TARGET = 0.3

export interface Norms {
  popP95: number
  exposedP95: number
  roadP95: number
  lstLo: number
  lstHi: number
}

function percentile(xs: number[], p: number) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return 1
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

/** Dataset-relative scales, computed once per city so formulas stay city-agnostic. */
export function computeNorms(cells: Cell[]): Norms {
  const lst = cells.map((c) => c.lst ?? NaN)
  return {
    popP95: Math.max(1, percentile(cells.map((c) => c.pop), 95)),
    exposedP95: Math.max(1, percentile(cells.map((c) => c.exposed), 95)),
    roadP95: Math.max(0.01, percentile(cells.map((c) => c.roadKm), 95)),
    lstLo: percentile(lst, 5),
    lstHi: percentile(lst, 95),
  }
}

/** How many people are outdoors for long hours here, 0..1 ("Bahar-Log" index). */
export function exposure(c: Cell, n: Norms) {
  return clamp01(
    0.45 * clamp01(c.pop / n.popP95) + 0.35 * clamp01(c.exposed / n.exposedP95) + 0.2 * clamp01(c.roadKm / n.roadP95),
  )
}

// ---- weather factors (city-wide) -----------------------------------------------------

/**
 * Night cold hazard 0..1 from the night's minimum "feels-like" temperature.
 * 0 at >= 16 C (no burning for warmth), 1 at <= 4 C (IMD cold-wave territory in the plains).
 */
export const nightCold = (w: WeatherSummary) => ramp(16 - w.nightMinFeels, 0, 12)

/**
 * Smoke-Trap Index 0..1 from the night ventilation coefficient (m2/s).
 * Night-time VC is far below the daytime values CPCB bands use, so the bands are set for
 * night: >= 1500 m2/s disperses smoke well (0), <= 100 m2/s traps it at breathing height (1).
 */
export const smokeTrap = (w: WeatherSummary) => ramp(1500 - w.ventilation, 0, 1400)

/**
 * Day heat hazard 0..1 from the afternoon's max "feels-like" temperature.
 * 0 at <= 32 C, 1 at >= 46 C (IMD severe heatwave is 45+ C actual or +6.5 C departure).
 */
export const dayHeat = (w: WeatherSummary) => ramp(w.dayMaxFeels, 32, 46)

// ---- per-cell scores ---------------------------------------------------------------------

export type FactorKey = 'canopy' | 'lst' | 'exposure' | 'day' | 'shelter' | 'cold' | 'trap'

export interface Breakdown {
  score: number
  need: number
  /** weight 0 = multiplier (scales everything) rather than an added part */
  factors: { key: FactorKey; value: number; weight: number }[]
}

export function chhaya(c: Cell, n: Norms, w: WeatherSummary): Breakdown {
  const canopyGap = c.canopy == null ? 0.5 : clamp01(1 - c.canopy / CANOPY_TARGET)
  const surface = c.lst == null ? 0.5 : ramp(c.lst, n.lstLo, n.lstHi)
  const exp = exposure(c, n)
  const placeHeat = 0.5 * canopyGap + 0.5 * surface
  const day = dayHeat(w)
  // a mild day still leaves some need (people work 8-10 h outdoors), so scale 0.4..1
  const need = clamp01(placeHeat * (0.3 + 0.7 * exp) * (0.4 + 0.6 * day))
  return {
    score: Math.round(100 * (1 - need)),
    need,
    factors: [
      { key: 'canopy', value: canopyGap, weight: 0.5 },
      { key: 'lst', value: surface, weight: 0.5 },
      { key: 'exposure', value: exp, weight: 0 },
      { key: 'day', value: day, weight: 0 },
    ],
  }
}

export function alaav(c: Cell, n: Norms, w: WeatherSummary): Breakdown {
  const exp = exposure(c, n)
  const shelterGap = ramp(c.shelterKm, 0.5, 3)
  const vulnerability = exp * (0.65 + 0.35 * shelterGap)
  const cold = nightCold(w)
  const trap = smokeTrap(w)
  const need = clamp01(vulnerability * cold * (0.75 + 0.25 * trap))
  return {
    score: Math.round(100 * (1 - need)),
    need,
    factors: [
      { key: 'exposure', value: exp, weight: 0 },
      { key: 'shelter', value: shelterGap, weight: 0.35 },
      { key: 'cold', value: cold, weight: 0 },
      { key: 'trap', value: trap, weight: 0 },
    ],
  }
}

export function score(season: Season, c: Cell, n: Norms, w: WeatherSummary) {
  return season === 'garmi' ? chhaya(c, n, w) : alaav(c, n, w)
}

/**
 * Structural need for an all-season asset (guard cabin): a place that is both
 * heat-exposed in summer AND cold-exposed in winter, judged on typical weather.
 */
export function allSeasonNeed(c: Cell, n: Norms, typicalWeather: WeatherSummary) {
  const h = chhaya(c, n, typicalWeather).need
  const k = alaav(c, n, typicalWeather).need
  // geometric mean rewards places that are bad in BOTH seasons
  return Math.sqrt(h * k)
}

export type Band = 'critical' | 'serious' | 'warning' | 'ok'
export function band(scoreValue: number): Band {
  if (scoreValue < 40) return 'critical'
  if (scoreValue < 60) return 'serious'
  if (scoreValue < 80) return 'warning'
  return 'ok'
}

/** City-level alert: a level plus the numbers the UI turns into words. */
export function cityAlert(season: Season, w: WeatherSummary) {
  if (season === 'sardi') {
    const c = nightCold(w)
    const t = smokeTrap(w)
    const level: Band = c > 0.75 ? 'critical' : c > 0.5 ? 'serious' : c > 0.2 ? 'warning' : 'ok'
    const trapWord = t > 0.8 ? 'trapStrong' : t > 0.4 ? 'trapSome' : 'trapNone'
    return { level, feels: w.nightMinFeels, trapWord, humidity: null as number | null }
  }
  const h = dayHeat(w)
  const level: Band = h > 0.8 ? 'critical' : h > 0.55 ? 'serious' : h > 0.25 ? 'warning' : 'ok'
  return { level, feels: w.dayMaxFeels, trapWord: null, humidity: w.dayMeanHumidity }
}
