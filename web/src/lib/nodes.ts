/**
 * Exposure Nodes: the places where the same people are outside in both seasons
 * (a colony gate, a labour chowk, a hospital gate), plus the two numbers the
 * winter loop runs on:
 *
 *   exposure dose        people x hours outside x vulnerability   (person-hours, work-heat style)
 *   Survival Burning Risk  cold x stagnation x night exposure x protection deficit
 *                          a transparent PLANNING index, not a probability of fire
 */
import { clamp01, nightCold, smokeTrap } from './scoring'
import { windChill } from './thermal'
import type { WeatherSummary } from './types'

export type Group = 'guard' | 'homeless' | 'labour' | 'vendor' | 'attendant' | 'worker' | 'commuter'

export interface SeasonProfile {
  /** local clock hours [start, end); end < start means it runs past midnight */
  hours: [number, number]
  people: Partial<Record<Group, number>>
}

export interface ExposureNode {
  id: string
  name: string
  nameHi: string
  lat: number
  lon: number
  source: 'osm-anchored' | 'synthetic'
  profilesSource: 'synthetic'
  winter: SeasonProfile & { heater: 'none' | 'distributed' | 'working'; shelterKm: number }
  summer: SeasonProfile & { water: boolean }
  /** Google Open Buildings footprints [lon, lat][] with height in m */
  buildings: { c: [number, number][]; h: number }[]
  /** ESA WorldCover tree pixels [lon, lat] (10 m) */
  trees: [number, number][]
}

export interface NodesFile {
  meta: Record<string, string>
  nodes: ExposureNode[]
}

/** How much one hour outside weighs for each group (work-heat style profile). */
export const VULNERABILITY: Record<Group, number> = {
  homeless: 1.5, // no shelter to go back to
  labour: 1.2, // heavy work, no fixed shade or warmth
  attendant: 1.1, // hospital families sleeping out
  guard: 1.0, // long static shifts
  vendor: 1.0,
  worker: 1.0,
  commuter: 0.5,
}

export const span = ([s, e]: [number, number]) => (e > s ? e - s : 24 - s + e)

/** Hours each group is exposed: commuters pass through (~15 min), everyone else stays the shift. */
export const hoursFor = (g: Group, p: SeasonProfile) => (g === 'commuter' ? 0.25 : span(p.hours))

export function peopleOf(p: SeasonProfile) {
  return Object.values(p.people).reduce((a, b) => a + (b ?? 0), 0)
}

/** Person-hours outside, weighted by vulnerability. */
export function exposureDose(p: SeasonProfile) {
  let dose = 0
  for (const [g, n] of Object.entries(p.people) as [Group, number][]) dose += n * hoursFor(g, p) * VULNERABILITY[g]
  return dose
}

// ---- Survival Burning Risk --------------------------------------------------------------

/** What we know about warmth at a node, from the plan and from Pulse. */
export interface ProtectionState {
  /** heater at the gate: none, handed over (not yet confirmed), confirmed working, or confirmed NOT working */
  heater: 'none' | 'distributed' | 'working' | 'failed'
  failReason?: string
  /** warm kits confirmed in use at the node */
  warmKits: number
  /** fire / survival-burning reports near the node this season */
  fireReports: number
}

export type RiskLevel = 'high' | 'medium' | 'low'

export interface BurningRisk {
  score: number // 0-100
  level: RiskLevel
  cold: number
  stagnation: number
  exposure: number
  deficit: number
  history: number
  feelsLike: number
}

/** The coldest the night feels: the lower of Open-Meteo apparent temperature and wind chill. */
export function nightFeels(w: Pick<WeatherSummary, 'nightMinFeels' | 'nightMinTemp' | 'nightMeanWind'>) {
  return Math.min(w.nightMinFeels, windChill(w.nightMinTemp, w.nightMeanWind * 3.6))
}

/**
 * Protection deficit 0..1. A heater that was only "distributed" counts as working with the
 * learned city-wide rate, so when Pulse shows heaters are less used than the files say,
 * every "distributed" gate's risk goes up.
 */
export function protectionDeficit(node: ExposureNode, st: ProtectionState, heaterWorkingRate: number) {
  const people = Math.max(1, peopleOf(node.winter))
  const guards = node.winter.people.guard ?? 0
  let covered = 0
  if (st.heater === 'working') covered += guards
  else if (st.heater === 'distributed') covered += guards * heaterWorkingRate
  covered += st.warmKits * 0.6 // a kit helps, but less than a heat source
  let deficit = clamp01(1 - covered / people)
  // homeless people near an open night shelter are a little better off
  if ((node.winter.people.homeless ?? 0) > 0) deficit *= 1 - 0.35 * clamp01(1 - node.winter.shelterKm / 1.5)
  return clamp01(deficit)
}

export function burningRisk(
  node: ExposureNode,
  w: Pick<WeatherSummary, 'nightMinFeels' | 'nightMinTemp' | 'nightMeanWind' | 'ventilation'>,
  st: ProtectionState,
  heaterWorkingRate: number,
): BurningRisk {
  const feelsLike = nightFeels(w)
  const cold = nightCold({ nightMinFeels: feelsLike } as WeatherSummary)
  const stagnation = smokeTrap(w as WeatherSummary)
  // saturating: one guard all night already matters; 150+ person-hours is the top
  const exposure = clamp01(Math.log1p(exposureDose(node.winter)) / Math.log1p(150))
  const deficit = protectionDeficit(node, st, heaterWorkingRate)
  const history = Math.min(0.2, st.fireReports * 0.1)
  // Burning happens on cold nights even with wind; still air makes the smoke worse, so it
  // scales the score rather than gating it. Each factor is shown to the user.
  const raw = cold * (0.6 + 0.4 * stagnation) * (0.4 + 0.6 * exposure) * (0.3 + 0.7 * deficit) + history
  const score = Math.round(100 * clamp01(raw))
  return {
    score, level: score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low',
    cold, stagnation, exposure, deficit, history, feelsLike,
  }
}

/** Convert a winter_nights.json row into the fields the risk needs. */
export interface NightRow {
  date: string
  minTemp: number
  minFeels: number
  wind: number
  vc: number
  pm25: number | null
}
export const nightAsWeather = (n: NightRow) => ({
  nightMinFeels: n.minFeels, nightMinTemp: n.minTemp, nightMeanWind: n.wind, ventilation: n.vc,
})
