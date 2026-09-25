/**
 * The simple demo rules behind every colour in the app. Pure functions, no I/O:
 * danger level per hour, today's mode, ritu, Indian AQI, fire risk, and the needs they imply.
 */

/** 0 Safe, 1 Be careful, 2 Get ready, 3 Act now (the IMD warning colour idea). */
export type Level = 0 | 1 | 2 | 3
export const LEVEL_COLOR = ['#1E9E5A', '#E0B000', '#F07F13', '#D7263D'] as const

export type Mode = 'cold' | 'heat' | 'humid' | 'rain' | 'smoky' | 'mild'
export const MODE_TINT: Record<Mode, string> = {
  cold: '#3D6FD9', heat: '#E8590C', humid: '#0CA3A3', rain: '#3B4CCA', mild: '#6C8EAD', smoky: '#6B6F80',
}

export interface Hour {
  /** local IST timestamp, "YYYY-MM-DDTHH:00" */
  time: string
  hour: number
  temp: number
  feels: number
  rh: number
  rainProb: number | null
  rain: number
  /** km/h */
  wind: number
  pm25: number | null
  pm10: number | null
  /** gases in µg/m³ as Open-Meteo gives them (CO too; converted to mg/m³ for the index) */
  o3?: number | null
  no2?: number | null
  so2?: number | null
  co?: number | null
  aqi: number | null
}

export interface Day {
  date: string
  hours: Hour[]
  tmax: number
  tmin: number
  fmax: number
  fmin: number
  rainProbMax: number | null
  rainSum: number
  sunrise?: string
  sunset?: string
  /** Indian AQI, CPCB method: 24-hour means (PM, NO2, SO2), highest 8-hour mean (O3, CO) */
  aqi: number | null
  /** the day's values behind the AQI, and the pollutant that sets it */
  air?: DayAir
  /** most common WMO weather code in daylight hours, when known */
  code?: number
}

// ---------- Indian AQI (CPCB breakpoints) ----------

/**
 * CPCB's sub-index: I = (Ihi - Ilo) / (BPhi - BPlo) x (C - BPlo) + Ilo, on the discrete bands
 * below; a value between two bands (30.5 for PM2.5) counts from the next band's floor. Capped at 500.
 * The open top band runs to 500 (PM2.5) and 600 (PM10) µg/m³.
 */
type Band = [lo: number, hi: number]
const INDEX: Band[] = [[0, 50], [51, 100], [101, 200], [201, 300], [301, 400], [401, 500]]
const PM25_BANDS: Band[] = [[0, 30], [31, 60], [61, 90], [91, 120], [121, 250], [251, 500]]
const PM10_BANDS: Band[] = [[0, 50], [51, 100], [101, 250], [251, 350], [351, 430], [431, 600]]

function subIndex(c: number, bands: Band[]) {
  if (!Number.isFinite(c) || c < 0) return NaN
  for (let i = 0; i < bands.length; i++) {
    const [lo, hi] = bands[i]
    if (c <= hi) {
      const [ilo, ihi] = INDEX[i]
      return ((ihi - ilo) / (hi - lo)) * (Math.max(c, lo) - lo) + ilo
    }
  }
  return 500
}

// Gases, from CPCB's "About National Air Quality Index" table (CO in mg/m³, the rest µg/m³;
// O3 and CO are 8-hour values). The open top bands run on to where the index reaches 500.
const NO2_BANDS: Band[] = [[0, 40], [41, 80], [81, 180], [181, 280], [281, 400], [401, 800]]
const O3_BANDS: Band[] = [[0, 50], [51, 100], [101, 168], [169, 208], [209, 748], [749, 1000]]
const CO_BANDS: Band[] = [[0, 1], [1.1, 2], [2.1, 10], [10.1, 17], [17.1, 34], [34.1, 50]]
const SO2_BANDS: Band[] = [[0, 40], [41, 80], [81, 380], [381, 800], [801, 1600], [1601, 2400]]

export type Pollutant = 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co'
/** Gas concentrations in µg/m³ (Open-Meteo units, CO included). */
export interface Gases {
  o3?: number | null
  no2?: number | null
  so2?: number | null
  co?: number | null
}
export interface DayAir extends Gases {
  pm25: number | null
  pm10: number | null
  main: Pollutant | null
}

const val = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : x)

/** Each pollutant's sub-index (only the ones we have a value for). */
export function aqiParts(pm25: number | null | undefined, pm10: number | null | undefined, g: Gases = {}): Partial<Record<Pollutant, number>> {
  const out: Partial<Record<Pollutant, number>> = {}
  const add = (k: Pollutant, c: number | null, bands: Band[]) => {
    if (c == null) return
    const s = subIndex(c, bands)
    if (Number.isFinite(s)) out[k] = Math.min(500, s)
  }
  add('pm25', val(pm25), PM25_BANDS)
  add('pm10', val(pm10), PM10_BANDS)
  add('o3', val(g.o3), O3_BANDS)
  add('no2', val(g.no2), NO2_BANDS)
  add('so2', val(g.so2), SO2_BANDS)
  const co = val(g.co)
  add('co', co == null ? null : co / 1000, CO_BANDS)
  return out
}

/**
 * Indian AQI: the worst sub-index. CPCB needs particulate matter among the pollutants, so
 * without PM2.5 or PM10 there is no AQI.
 */
export function indianAqi(pm25: number | null | undefined, pm10: number | null | undefined, g?: Gases): number | null {
  const parts = aqiParts(pm25, pm10, g)
  if (parts.pm25 == null && parts.pm10 == null) return null
  return Math.round(Math.max(...Object.values(parts)))
}

/** The pollutant with the worst sub-index. */
export function mainPollutant(parts: Partial<Record<Pollutant, number>>): Pollutant | null {
  let best: Pollutant | null = null
  for (const [k, v] of Object.entries(parts) as [Pollutant, number][]) if (best == null || v > (parts[best] ?? -1)) best = k
  return best
}

// ---------- GRAP (Delhi-NCR) ----------

/**
 * The Graded Response Action Plan stage this AQI falls in (CAQM, revised December 2024):
 * I 201-300, II 301-400, III 401-450, IV above 450. The official stage is declared by CAQM.
 */
export function grapStage(aqi: number | null | undefined): 1 | 2 | 3 | 4 | null {
  if (aqi == null || aqi <= 200) return null
  if (aqi <= 300) return 1
  if (aqi <= 400) return 2
  if (aqi <= 450) return 3
  return 4
}
/** Delhi and the NCR districts around it (a generous box). */
export const inNcr = (lat: number, lon: number) => lat >= 27.8 && lat <= 29.3 && lon >= 76.3 && lon <= 78.1

export type AqiCat = 0 | 1 | 2 | 3 | 4 | 5
export const AQI_COLOR = ['#00B050', '#92D050', '#FFFF00', '#FFC000', '#FF0000', '#C00000'] as const
export function aqiCategory(aqi: number): AqiCat {
  if (aqi <= 50) return 0
  if (aqi <= 100) return 1
  if (aqi <= 200) return 2
  if (aqi <= 300) return 3
  if (aqi <= 400) return 4
  return 5
}

// ---------- danger level ----------

export function heatLevel(feels: number): Level {
  if (feels < 32) return 0
  if (feels < 38) return 1
  if (feels < 43) return 2
  return 3
}
export function coldLevel(feels: number): Level {
  if (feels >= 15) return 0
  if (feels >= 10) return 1
  if (feels >= 5) return 2
  return 3
}

/** Danger for a person working outside in this hour: worse of heat and cold, raised by bad air. */
export function hourLevel(h: Pick<Hour, 'feels' | 'aqi'>): Level {
  let l = Math.max(heatLevel(h.feels), coldLevel(h.feels)) as Level
  if (h.aqi != null && h.aqi > 300) l = 3
  else if (h.aqi != null && h.aqi > 200) l = Math.max(l, 2) as Level
  return l
}

export const isNightHour = (hour: number) => hour >= 20 || hour < 8
export type Shift = 'day' | 'night'
export const inShift = (hour: number, shift: Shift) => (shift === 'night' ? isNightHour(hour) : !isNightHour(hour))

// ---------- season ----------

/** Plains: plant with the monsoon (July-September). Cold desert (Leh): in spring (March-May). */
export type Climate = 'plains' | 'cold_desert'
export const climateOf = (elevation: number | null | undefined, pilot?: string | null): Climate =>
  (elevation ?? 0) > 2500 || pilot === 'leh' ? 'cold_desert' : 'plains'
export function plantingNow(month: number, c: Climate): boolean {
  return c === 'cold_desert' ? month >= 3 && month <= 5 : month >= 7 && month <= 9
}

export type Ritu = 'vasant' | 'grishma' | 'varsha' | 'sharad' | 'hemant' | 'shishir'
/** month is 1-12 */
export function rituOf(month: number): Ritu {
  if (month === 3 || month === 4) return 'vasant'
  if (month === 5 || month === 6) return 'grishma'
  if (month === 7 || month === 8) return 'varsha'
  if (month === 9 || month === 10) return 'sharad'
  if (month === 11 || month === 12) return 'hemant'
  return 'shishir'
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

/** Afternoon (12:00-16:00) mean humidity. */
export function afternoonRh(d: Day) {
  return mean(d.hours.filter((h) => h.hour >= 12 && h.hour <= 16).map((h) => h.rh))
}

/** Today's modes from the forecast, in rule order, at most two. Empty rules give ['mild']. */
export function modesOf(d: Day): Mode[] {
  const out: Mode[] = []
  if (d.fmin <= 10) out.push('cold')
  if (d.fmax >= 40 || d.tmax >= 38) out.push('heat')
  if (d.tmax >= 32 && afternoonRh(d) >= 60) out.push('humid')
  if ((d.rainProbMax ?? 0) >= 60 || d.rainSum >= 5) out.push('rain')
  if (d.aqi != null && d.aqi >= 201) out.push('smoky')
  return out.length ? out.slice(0, 2) : ['mild']
}

export function dayLevel(d: Day): Level {
  return Math.max(0, ...d.hours.map(hourLevel)) as Level
}

/** First hour (>= fromHour) with a real chance of rain, for "Rain possible after 4 pm". */
export function rainFrom(d: Day, fromHour = 0): number | null {
  const h = d.hours.find((x) => x.hour >= fromHour && ((x.rainProb ?? 0) >= 40 || x.rain >= 0.5))
  return h ? h.hour : null
}

/** For the Mild line: "Warmer from Sunday: up to 33°" and friends. */
export type Trend = { kind: 'warmer' | 'cooler'; date: string; value: number } | { kind: 'same'; min: number; max: number }
export function trendOf(days: Day[]): Trend | null {
  if (days.length < 2) return null
  const [today, ...next] = days.slice(0, 6)
  const warm = next.find((d) => d.tmax >= today.tmax + 2)
  const cool = next.find((d) => d.tmin <= today.tmin - 2)
  if (warm && (!cool || warm.date <= cool.date)) return { kind: 'warmer', date: warm.date, value: Math.round(Math.max(...next.map((d) => d.tmax))) }
  if (cool) return { kind: 'cooler', date: cool.date, value: Math.round(Math.min(...next.map((d) => d.tmin))) }
  return { kind: 'same', min: Math.round(Math.min(...next.map((d) => d.tmin))), max: Math.round(Math.max(...next.map((d) => d.tmax))) }
}

// ---------- condition screens ----------

/**
 * What the whole screen is about today. The worst hazard wins; heat and bad air together are
 * "Double risk". Air wins a tie with cold (a smoggy winter night is about the smoke).
 */
export type Condition = 'mild' | 'warm' | 'hot' | 'air' | 'cold' | 'double' | 'rain'
export type Hazard = 'heat' | 'cold' | 'air'
export const COND_COLOR: Record<Condition, string> = {
  mild: '#1E9E5A', warm: '#E0B000', hot: '#D7263D', air: '#F07F13', cold: '#3D6FD9', double: '#D7263D', rain: '#3B4CCA',
}

/** Rain likely: a 60% chance in some hour, or 5 mm over the day (the Rain mode rule). */
export const rainLikely = (d: Pick<Day, 'rainProbMax' | 'rainSum'>) => (d.rainProbMax ?? 0) >= 60 || d.rainSum >= 5

export function airLevel(aqi: number | null | undefined): Level {
  if (aqi == null) return 0
  if (aqi > 300) return 3
  if (aqi > 200) return 2
  if (aqi > 100) return 1
  return 0
}

/** Evening of this day into the morning of the next (18:00 to 09:00). */
export function nightHours(d: Day, next?: Day): Hour[] {
  return [...d.hours.filter((h) => h.hour >= 18), ...(next ?? d).hours.filter((h) => h.hour <= 9)]
}

export function hazardsOf(d: Day, next?: Day): Record<Hazard, Level> {
  return {
    heat: Math.max(0, ...d.hours.map((h) => heatLevel(h.feels))) as Level,
    cold: Math.max(0, ...nightHours(d, next).map((h) => coldLevel(h.feels))) as Level,
    // CPCB uses the 24-hour average, so the day's AQI decides the screen
    air: airLevel(d.aqi),
  }
}

export interface ConditionInfo {
  cond: Condition
  /** the other hazards at "Get ready" or worse, worst first, and rain when it is not the screen itself */
  also: (Hazard | 'rain')[]
  hz: Record<Hazard, Level>
}

/** Poor air (CPCB orange); Very poor or worse is red. */
export const condColor = (i: Pick<ConditionInfo, 'cond' | 'hz'>) => (i.cond === 'air' && i.hz.air >= 3 ? '#D7263D' : COND_COLOR[i.cond])

export function conditionOf(d: Day, next?: Day): ConditionInfo {
  const hz = hazardsOf(d, next)
  const serious = (['air', 'cold', 'heat'] as Hazard[]).filter((k) => hz[k] >= 2).sort((a, b) => hz[b] - hz[a])
  if (hz.heat >= 2 && hz.air >= 2) return { cond: 'double', also: serious.filter((k) => k === 'cold'), hz }
  const top = serious[0]
  const wet = rainLikely(d)
  const rest: (Hazard | 'rain')[] = [...serious.slice(1), ...(wet ? (['rain'] as const) : [])]
  if (top === 'air') return { cond: 'air', also: rest, hz }
  if (top === 'cold') return { cond: 'cold', also: rest, hz }
  if (top === 'heat') return { cond: 'hot', also: rest, hz }
  // rain sits below the serious hazards and above a warm or mild day
  if (wet) return { cond: 'rain', also: hz.heat === 1 ? ['heat'] : [], hz }
  return { cond: hz.heat === 1 ? 'warm' : 'mild', also: [], hz }
}

/** A run of hours, `to` exclusive. `to` below `from` means it runs past midnight. */
export interface Span {
  from: number
  to: number
}

function longestRun(hours: Hour[], hit: (h: Hour) => boolean): Span | null {
  let best: Span | null = null
  let len = 0
  let bestLen = 0
  let start = -1
  hours.forEach((h, i) => {
    if (hit(h)) {
      if (start < 0) start = i
      len = i - start + 1
      if (len > bestLen) {
        bestLen = len
        best = { from: hours[start].hour, to: (hours[i].hour + 1) % 24 }
      }
    } else start = -1
  })
  return best
}

/** Daytime hours at this heat level or worse: "12 to 4 pm". */
export const heatSpan = (d: Day, min: Level = 2) => longestRun(d.hours, (h) => heatLevel(h.feels) >= min)
/** Night hours at this cold level or worse: "10 pm to 6 am". */
export const coldSpan = (d: Day, next?: Day, min: Level = 2) => longestRun(nightHours(d, next), (h) => coldLevel(h.feels) >= min)
/** Hours with a real chance of rain (40%+) or 0.5 mm+: "Rain likely from 2 pm to 8 pm". */
export const rainSpan = (d: Day) => longestRun(d.hours, (h) => (h.rainProb ?? 0) >= 40 || h.rain >= 0.5)
/** The 3 hours with the worst air today. */
export function worstAirSpan(d: Day): Span | null {
  const hs = d.hours.filter((h) => h.aqi != null)
  if (hs.length < 3) return null
  let best = 0
  let at = 0
  for (let i = 0; i + 2 < hs.length; i++) {
    const s = hs[i].aqi! + hs[i + 1].aqi! + hs[i + 2].aqi!
    if (s > best) {
      best = s
      at = i
    }
  }
  return { from: hs[at].hour, to: (hs[at + 2].hour + 1) % 24 }
}

// ---------- air: what is the real problem ----------

export const pm25Index = (c: number | null | undefined) => (c == null ? null : Math.round(subIndex(c, PM25_BANDS)))
export const pm10Index = (c: number | null | undefined) => (c == null ? null : Math.round(subIndex(c, PM10_BANDS)))

/**
 * Dust or smoke? Coarse dust (roads, construction) is mostly PM10; smoke (burning, traffic)
 * is mostly fine PM2.5. When PM2.5 is less than half of PM10, dust drives the AQI.
 */
export function airProblem(pm25: number | null | undefined, pm10: number | null | undefined): 'dust' | 'smoke' | null {
  if (pm25 == null || pm10 == null || pm10 <= 0) return null
  return pm25 / pm10 < 0.5 ? 'dust' : 'smoke'
}

// ---------- fire risk tonight ----------

export type Heater = 'none' | 'unconfirmed' | 'working' | 'failed'
export interface NightStats {
  feelsMin: number
  /** km/h */
  windMean: number
}
/** Night = 20:00-23:00 of this day plus 00:00-07:00 of the next when we have it, else of this day. */
export function nightStats(d: Day, next?: Day): NightStats {
  const hrs = [...d.hours.filter((h) => h.hour >= 20), ...(next ?? d).hours.filter((h) => h.hour < 8)]
  return { feelsMin: Math.min(...hrs.map((h) => h.feels)), windMean: mean(hrs.map((h) => h.wind)) }
}
export type FireRisk = 'high' | 'medium' | 'low'
/** The quick three-question version, kept for the rules card. */
export function fireRisk(n: NightStats, heater: Heater | undefined): FireRisk {
  const hits = [n.feelsMin < 5, n.windMean < 7, heater !== 'working'].filter(Boolean).length
  return hits === 3 ? 'high' : hits === 2 ? 'medium' : 'low'
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)

export interface Burning {
  /** 0-100: a priority score for tonight, NOT a probability of fire */
  score: number
  level: FireRisk
  /** each part 0..1, shown on screen */
  parts: { cold: number; still: number; people: number; noHeat: number; reports: number }
}

/**
 * Survival Burning Risk: where someone may light a fire to stay warm tonight.
 *   cold    0 at a night feels-like of 16° or more, 1 at 4° or less
 *   still   0 with 12 km/h wind or more, 1 with 2 km/h or less (still air keeps smoke at head height)
 *   people  person-hours outside at night, 1 at 150 or more
 *   noHeat  working heater 0.1; handed out but not confirmed = share of heaters that fail; none 1
 * score = cold x (0.6 + 0.4 still) x (0.4 + 0.6 people) x (0.3 + 0.7 noHeat) + fire reports
 */
export function burningRisk(n: NightStats, o: { personHours: number; heater: Heater | undefined; heaterRate: number; shelter?: boolean; reports?: number }): Burning {
  const cold = clamp01((16 - n.feelsMin) / 12)
  const still = clamp01((12 - n.windMean) / 10)
  const people = clamp01(Math.log1p(Math.max(0, o.personHours)) / Math.log1p(150))
  let noHeat = o.heater === 'working' ? 0.1 : o.heater === 'unconfirmed' ? 1 - o.heaterRate : 1
  if (o.shelter) noHeat *= 0.65
  const reports = Math.min(0.2, (o.reports ?? 0) * 0.1)
  const raw = cold * (0.6 + 0.4 * still) * (0.4 + 0.6 * people) * (0.3 + 0.7 * noHeat) + (cold > 0 ? reports : 0)
  const score = Math.round(100 * clamp01(raw))
  return { score, level: score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low', parts: { cold, still, people, noHeat, reports } }
}

// ---------- needs ----------

export type Need =
  | 'warm_kit' | 'heater_check' | 'shelter_ride' | 'no_fines'
  | 'shade' | 'water_ors' | 'work_hours' | 'cool_rest'
  | 'shade_breaks' | 'dizzy'
  | 'sheet' | 'dry_sleep' | 'flood_roads'
  | 'masks' | 'move_stalls' | 'stop_burning' | 'water_roads'
  | 'low_risk'

export const NEEDS: Record<Mode, Need[]> = {
  cold: ['warm_kit', 'heater_check', 'shelter_ride', 'no_fines'],
  heat: ['shade', 'water_ors', 'work_hours', 'cool_rest'],
  humid: ['water_ors', 'shade_breaks', 'dizzy'],
  rain: ['sheet', 'dry_sleep', 'flood_roads'],
  smoky: ['masks', 'stop_burning', 'water_roads', 'move_stalls'],
  mild: ['low_risk'],
}

/**
 * Needs for the day's screen: the forecast modes, plus what the condition adds when the mode
 * rules stay quiet (a warm afternoon is below the Heat mode but still needs water and shade).
 */
export function modesForDay(modes: Mode[], info: Pick<ConditionInfo, 'cond'>): Mode[] {
  const m = modes.filter((x) => x !== 'mild')
  const c = info.cond
  if ((c === 'warm' || c === 'hot' || c === 'double') && !m.includes('heat') && !m.includes('humid')) m.unshift(c === 'warm' ? 'humid' : 'heat')
  if ((c === 'air' || c === 'double') && !m.includes('smoky')) m.unshift('smoky')
  if (c === 'cold' && !m.includes('cold')) m.unshift('cold')
  if (c === 'rain' && !m.includes('rain')) m.unshift('rain')
  return m.length ? m : ['mild']
}
export const needsForDay = (modes: Mode[], info: Pick<ConditionInfo, 'cond'>): Need[] => needsFor(modesForDay(modes, info))

/** 3 to 5 needs for the day's modes, de-duplicated, primary mode first. */
export function needsFor(modes: Mode[]): Need[] {
  const out: Need[] = []
  for (const m of modes) for (const n of NEEDS[m]) if (!out.includes(n)) out.push(n)
  return out.slice(0, 5)
}
