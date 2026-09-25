/**
 * Live data: Open-Meteo forecast + air quality for any place, and real past days for replays.
 * Every response is cached in localStorage (30 min fresh). A request that fails or takes more
 * than 8 s falls back to the last saved copy, so the screen is never blank.
 */
import { addDays } from './ist'
import { indianAqi, type Day, type Hour } from './risk'

export interface Current {
  time: string
  temp: number
  feels: number
  rh: number
  rain: number
  code: number
  wind: number
  isDay: boolean
}
export interface Air {
  aqi: number
  pm25: number
  pm10: number
}
export interface Weather {
  kind: 'live' | 'replay'
  lat: number
  lon: number
  elevation: number | null
  current: Current
  air: Air | null
  airAvailable: boolean
  days: Day[]
  /** replays: the real date being replayed */
  replayDate?: string
}
export interface Loaded {
  data: Weather
  savedAt: number
  /** true when this is an old saved copy because the network failed */
  stale: boolean
  /** fetched just now ("Live") or read from the saved copy on this device ("Saved forecast") */
  from: 'network' | 'cache'
}

const FRESH_MS = 30 * 60 * 1000
const TIMEOUT_MS = 8000
const PREFIX = 'bm:wx:'

async function getOnce<T>(url: string, ms: number): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(t)
  }
}

/** One quick retry for fast failures (a busy server answers 503 at once); never past the time limit. */
async function getJson<T>(url: string, ms = TIMEOUT_MS): Promise<T> {
  const start = Date.now()
  try {
    return await getOnce<T>(url, ms)
  } catch (e) {
    const left = ms - (Date.now() - start) - 800
    if (left < 2000) throw e
    await new Promise((r) => setTimeout(r, 800))
    return getOnce<T>(url, left)
  }
}

// ---------- cache ----------

interface Entry {
  savedAt: number
  data: Weather
}
function readEntry(key: string): Entry | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as Entry) : null
  } catch {
    return null
  }
}
function writeEntry(key: string, data: Weather) {
  const e: Entry = { savedAt: Date.now(), data }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(e))
  } catch {
    // full: drop other saved weather and try once more
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) && k !== PREFIX + key) localStorage.removeItem(k)
      localStorage.setItem(PREFIX + key, JSON.stringify(e))
    } catch {
      /* storage blocked: live data still works */
    }
  }
  return e
}
/** Latest saved copy for these coordinates, any date: used when the network is down. */
function latestFor(coord: string): Entry | null {
  let best: Entry | null = null
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(PREFIX) || !k.includes(coord)) continue
      const e = readEntry(k.slice(PREFIX.length))
      if (e && (!best || e.savedAt > best.savedAt)) best = e
    }
  } catch {
    /* ignore */
  }
  return best
}
const coordKey = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`

async function cached(
  key: string, coord: string, force: boolean, maxAge: number | ((d: Weather) => number), load: () => Promise<Weather>,
): Promise<Loaded> {
  const hit = readEntry(key)
  const age = hit ? (typeof maxAge === 'number' ? maxAge : maxAge(hit.data)) : 0
  if (hit && !force && Date.now() - hit.savedAt < age) return { data: hit.data, savedAt: hit.savedAt, stale: false, from: 'cache' }
  try {
    const data = await load()
    const e = writeEntry(key, data)
    return { data, savedAt: e.savedAt, stale: false, from: 'network' }
  } catch (err) {
    const old = hit ?? latestFor(coord)
    if (old) return { data: old.data, savedAt: old.savedAt, stale: true, from: 'cache' }
    throw err
  }
}

// ---------- parsing ----------

interface OmHourly {
  time: string[]
  temperature_2m: (number | null)[]
  apparent_temperature: (number | null)[]
  relative_humidity_2m: (number | null)[]
  precipitation_probability?: (number | null)[]
  precipitation?: (number | null)[]
  wind_speed_10m: (number | null)[]
  weather_code?: (number | null)[]
}
interface OmAirHourly {
  time: string[]
  pm2_5: (number | null)[]
  pm10: (number | null)[]
}

const num = (v: number | null | undefined, d = NaN) => (v == null || !Number.isFinite(v) ? d : v)
const avg = (xs: number[]) => {
  const f = xs.filter(Number.isFinite)
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN
}
function mode(xs: number[]) {
  const c = new Map<number, number>()
  for (const x of xs) if (Number.isFinite(x)) c.set(x, (c.get(x) ?? 0) + 1)
  let best: number | undefined
  let n = 0
  for (const [k, v] of c) if (v > n || (v === n && best != null && k > best)) (best = k), (n = v)
  return best
}

/** Group hourly rows into days of exactly the hours we have (normally 24). */
export function buildDays(h: OmHourly, air: OmAirHourly | null, dates: string[]): Day[] {
  const airAt = new Map<string, { pm25: number | null; pm10: number | null }>()
  air?.time.forEach((t, i) => airAt.set(t, { pm25: air.pm2_5[i], pm10: air.pm10[i] }))
  return dates
    .map((date) => {
      const hours: Hour[] = []
      const codes: number[] = []
      h.time.forEach((t, i) => {
        if (!t.startsWith(date)) return
        const a = airAt.get(t)
        const pm25 = a?.pm25 ?? null
        const pm10 = a?.pm10 ?? null
        const hour = Number(t.slice(11, 13))
        hours.push({
          time: t, hour,
          temp: num(h.temperature_2m[i]),
          feels: num(h.apparent_temperature[i], num(h.temperature_2m[i])),
          rh: num(h.relative_humidity_2m[i]),
          rainProb: h.precipitation_probability ? (h.precipitation_probability[i] ?? null) : null,
          rain: num(h.precipitation?.[i], 0),
          wind: num(h.wind_speed_10m[i], 0),
          pm25, pm10, aqi: indianAqi(pm25, pm10),
        })
        if (hour >= 7 && hour <= 18 && h.weather_code?.[i] != null) codes.push(h.weather_code[i] as number)
      })
      if (!hours.length) return null as Day | null
      const temps = hours.map((x) => x.temp)
      const feels = hours.map((x) => x.feels)
      const probs = hours.map((x) => x.rainProb).filter((x): x is number => x != null)
      const pm25s = hours.map((x) => x.pm25 ?? NaN)
      const pm10s = hours.map((x) => x.pm10 ?? NaN)
      const m25 = avg(pm25s)
      const m10 = avg(pm10s)
      return {
        date, hours,
        tmax: Math.max(...temps), tmin: Math.min(...temps),
        fmax: Math.max(...feels), fmin: Math.min(...feels),
        rainProbMax: probs.length ? Math.max(...probs) : null,
        rainSum: hours.reduce((a, x) => a + x.rain, 0),
        aqi: indianAqi(Number.isFinite(m25) ? m25 : null, Number.isFinite(m10) ? m10 : null),
        code: mode(codes),
      } as Day
    })
    .filter((d): d is Day => d != null)
}

// ---------- live forecast ----------

const HOURLY = 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code'
const DAILY = 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,sunrise,sunset'

interface OmForecast {
  elevation?: number
  current: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    precipitation: number
    weather_code: number
    wind_speed_10m: number
    is_day: number
  }
  hourly: OmHourly
  daily: { time: string[]; sunrise: string[]; sunset: string[] }
}
interface OmAir {
  current?: { pm2_5: number | null; pm10: number | null }
  hourly?: OmAirHourly
}

/**
 * Forecast for 7 days starting at `start` (today in IST, or a demo ?date inside the forecast
 * range). Air is optional: if it fails we still show the weather.
 */
export async function loadLive(lat: number, lon: number, start: string, force = false): Promise<Loaded> {
  const coord = coordKey(lat, lon)
  const end = addDays(start, 6)
  return cached(`live:${coord}:${start}`, coord, force, FRESH_MS, async () => {
    const base = `latitude=${lat}&longitude=${lon}&timezone=Asia%2FKolkata&start_date=${start}&end_date=${end}`
    const wUrl =
      `https://api.open-meteo.com/v1/forecast?${base}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day` +
      `&hourly=${HOURLY}&daily=${DAILY}`
    const aUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&timezone=Asia%2FKolkata&current=pm2_5,pm10&hourly=pm2_5,pm10&start_date=${start}&end_date=${addDays(start, 2)}`
    const [w, a] = await Promise.all([getJson<OmForecast>(wUrl), getJson<OmAir>(aUrl).catch(() => null)])
    const days = buildDays(w.hourly, a?.hourly ?? null, w.daily.time)
    days.forEach((d, i) => {
      d.sunrise = w.daily.sunrise[i]
      d.sunset = w.daily.sunset[i]
    })
    const c = w.current
    const aqi = indianAqi(a?.current?.pm2_5, a?.current?.pm10)
    return {
      kind: 'live', lat, lon, elevation: w.elevation ?? null,
      current: {
        time: c.time, temp: c.temperature_2m, feels: c.apparent_temperature, rh: c.relative_humidity_2m,
        rain: c.precipitation, code: c.weather_code, wind: c.wind_speed_10m, isDay: c.is_day === 1,
      },
      air: aqi == null ? null : { aqi, pm25: a?.current?.pm2_5 ?? NaN, pm10: a?.current?.pm10 ?? NaN },
      airAvailable: aqi != null,
      days,
    }
  })
}

// ---------- real past days ----------

/**
 * "See another day": real archive weather and air for a past day.
 *   summer  the hottest day (highest feels-like) of May-June 2026 at this place
 *   winter  the coldest night of January 2026 at this place
 *   smog    Delhi, 25 December 2024: a smoggy winter night
 *   double  Delhi, 19 June 2024: the day in May-June 2024 with the most hours when heat and
 *           air were both "Get ready" or worse (12 hours; Open-Meteo archive + CAMS)
 * The day after is loaded too, for "Tomorrow" and for the night that runs past midnight.
 */
export type ReplayKind = 'summer' | 'winter' | 'smog' | 'double'
export const REPLAY_KINDS: ReplayKind[] = ['smog', 'summer', 'double', 'winter']
type Pick = { range: [string, string]; by: 'hottest' | 'coldest' } | { date: string }
const REPLAY: Record<ReplayKind, { pick: Pick; nowHour: number; place: 'gwalior' | 'delhi' }> = {
  summer: { pick: { range: ['2026-05-01', '2026-06-30'], by: 'hottest' }, nowHour: 15, place: 'gwalior' },
  winter: { pick: { range: ['2026-01-01', '2026-01-31'], by: 'coldest' }, nowHour: 23, place: 'gwalior' },
  smog: { pick: { date: '2024-12-25' }, nowHour: 20, place: 'delhi' },
  double: { pick: { date: '2024-06-19' }, nowHour: 14, place: 'delhi' },
}
/** The pilot place each past day is shown for in the sidebar. */
export const replayPlace = (k: ReplayKind) => REPLAY[k].place

/**
 * The official city number for a past day, where one was published. Shown above our model value.
 * Smog day: "average Air Quality Index, AQI of 334 as of 8 PM", All India Radio News,
 * 25 Dec 2024, 9:24 PM, citing the Central Pollution Control Board.
 */
export const REPLAY_FACT: Partial<Record<ReplayKind, { aqi: number; hour: number; url: string }>> = {
  smog: { aqi: 334, hour: 20, url: 'https://www.newsonair.gov.in/delhis-air-quality-remains-very-poor-with-aqi-surpassing-350/' },
}

interface OmArchive {
  elevation?: number
  daily: { time: string[]; apparent_temperature_max: (number | null)[]; apparent_temperature_min: (number | null)[] }
  hourly: OmHourly
}

export async function loadReplay(kind: ReplayKind, lat: number, lon: number): Promise<Loaded> {
  const coord = coordKey(lat, lon)
  const cfg = REPLAY[kind]
  // past data never changes: keep it for 30 days. A copy saved when the air request failed is
  // kept for 10 minutes only, so one bad request cannot take the air screen away for a month.
  const keep = (d: Weather) => (d.airAvailable ? 30 * 86400_000 : 10 * 60_000)
  return cached(`replay:${kind}:${coord}`, `replay:${kind}:${coord}`, false, keep, async () => {
    const [from, to] = 'date' in cfg.pick ? [cfg.pick.date, addDays(cfg.pick.date, 1)] : cfg.pick.range
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${from}&end_date=${to}` +
      `&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min` +
      `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&timezone=Asia%2FKolkata`
    const r = await getJson<OmArchive>(url, 12000)
    let date: string
    if ('date' in cfg.pick) date = cfg.pick.date
    else {
      const hot = cfg.pick.by === 'hottest'
      const vals = hot ? r.daily.apparent_temperature_max : r.daily.apparent_temperature_min
      let pick = 0
      vals.forEach((v, i) => {
        if (v == null) return
        const best = vals[pick] ?? (hot ? -Infinity : Infinity)
        if (hot ? v > best : v < best) pick = i
      })
      // the coldest "night" is the early morning of the day with the lowest minimum: show the evening before
      date = !hot && pick > 0 ? r.daily.time[pick - 1] : r.daily.time[pick]
    }
    const dates = [date, addDays(date, 1)]
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm2_5,pm10&timezone=Asia%2FKolkata&start_date=${dates[0]}&end_date=${dates[1]}`
    // the air archive is slow now and then: one more try before giving up on it
    const air = await getJson<OmAir>(airUrl, 12000).catch(() => getJson<OmAir>(airUrl, 12000)).catch(() => null)
    const hasAir = !!air?.hourly?.pm2_5?.some((v) => v != null)
    const days = buildDays(r.hourly, hasAir ? air!.hourly! : null, dates)
    const now = days[0].hours[cfg.nowHour] ?? days[0].hours[0]
    const aqi = now.aqi
    return {
      kind: 'replay', lat, lon, elevation: r.elevation ?? null, replayDate: date,
      current: { time: now.time, temp: now.temp, feels: now.feels, rh: now.rh, rain: now.rain, code: days[0].code ?? 0, wind: now.wind, isDay: cfg.nowHour >= 7 && cfg.nowHour < 19 },
      air: aqi == null ? null : { aqi, pm25: now.pm25 ?? NaN, pm10: now.pm10 ?? NaN },
      airAvailable: hasAir,
      days,
    }
  })
}

/** Warm the cache for the pilot places in the background. */
export function prefetch(places: { lat: number; lon: number }[], start: string) {
  // wait until the current place has loaded, so the same forecast is not asked for twice
  setTimeout(() => places.forEach((p) => loadLive(p.lat, p.lon, start).catch(() => {})), 6000)
}

/** Drop saved weather older than 3 days so storage never fills up. */
export function pruneCache() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(PREFIX) || k.includes('replay:')) continue
      const e = readEntry(k.slice(PREFIX.length))
      if (!e || Date.now() - e.savedAt > 3 * 86400_000) localStorage.removeItem(k)
    }
  } catch {
    /* ignore */
  }
}
