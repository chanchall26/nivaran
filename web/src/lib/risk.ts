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
  /** Indian AQI from the day's mean PM2.5 / PM10 (CPCB uses 24-hour averages) */
  aqi: number | null
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

/** Indian AQI: the higher of the PM2.5 and PM10 sub-indices. */
export function indianAqi(pm25: number | null | undefined, pm10: number | null | undefined): number | null {
  const a = pm25 == null ? NaN : subIndex(pm25, PM25_BANDS)
  const b = pm10 == null ? NaN : subIndex(pm10, PM10_BANDS)
  const m = Math.max(Number.isFinite(a) ? a : -1, Number.isFinite(b) ? b : -1)
  return m < 0 ? null : Math.round(m)
}

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
export type Condition = 'mild' | 'warm' | 'hot' | 'air' | 'cold' | 'double'
export type Hazard = 'heat' | 'cold' | 'air'
export const COND_COLOR: Record<Condition, string> = {
  mild: '#1E9E5A', warm: '#E0B000', hot: '#D7263D', air: '#F07F13', cold: '#3D6FD9', double: '#D7263D',
}

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
  /** the hazards behind it, worst first; the rest that are also at "Get ready" or worse */
  also: Hazard[]
  hz: Record<Hazard, Level>
}

/** Poor air (CPCB orange); Very poor or worse is red. */
export const condColor = (i: Pick<ConditionInfo, 'cond' | 'hz'>) => (i.cond === 'air' && i.hz.air >= 3 ? '#D7263D' : COND_COLOR[i.cond])

export function conditionOf(d: Day, next?: Day): ConditionInfo {
  const hz = hazardsOf(d, next)
  const serious = (['air', 'cold', 'heat'] as Hazard[]).filter((k) => hz[k] >= 2).sort((a, b) => hz[b] - hz[a])
  if (hz.heat >= 2 && hz.air >= 2) return { cond: 'double', also: serious.filter((k) => k === 'cold'), hz }
  const top = serious[0]
  const rest = serious.slice(1)
  if (top === 'air') return { cond: 'air', also: rest, hz }
  if (top === 'cold') return { cond: 'cold', also: rest, hz }
  if (top === 'heat') return { cond: 'hot', also: rest, hz }
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
  return m.length ? m : ['mild']
}
export const needsForDay = (modes: Mode[], info: Pick<ConditionInfo, 'cond'>): Need[] => needsFor(modesForDay(modes, info))

/** 3 to 5 needs for the day's modes, de-duplicated, primary mode first. */
export function needsFor(modes: Mode[]): Need[] {
  const out: Need[] = []
  for (const m of modes) for (const n of NEEDS[m]) if (!out.includes(n)) out.push(n)
  return out.slice(0, 5)
}
