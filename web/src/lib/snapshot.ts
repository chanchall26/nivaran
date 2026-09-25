/**
 * Saved forecasts for the pilot cities (Brief 2, section 1): real Open-Meteo responses written
 * by scripts/save-snapshots.mjs into public/snapshots/. They open at once and work offline.
 * The result has live.ts's `Loaded` shape with from: 'cache', so the header says
 * "Saved forecast, {saved_at}" and never "Live".
 */
import { istHour, istToday } from './ist'
import { buildDays, type Loaded, type Weather } from './live'

export type SnapCity = 'gwalior' | 'delhi' | 'leh'
export const SNAP_CITIES: SnapCity[] = ['gwalior', 'delhi', 'leh']
/** where each snapshot was taken (the preset points) */
export const SNAP_AT: Record<SnapCity, { lat: number; lon: number }> = {
  gwalior: { lat: 26.178647, lon: 78.144908 },
  delhi: { lat: 28.6315, lon: 77.2167 },
  leh: { lat: 34.1526, lon: 77.5771 },
}

interface Hourly {
  time: string[]
  temperature_2m: (number | null)[]
  apparent_temperature: (number | null)[]
  relative_humidity_2m: (number | null)[]
  precipitation_probability?: (number | null)[]
  precipitation?: (number | null)[]
  wind_speed_10m: (number | null)[]
  weather_code?: (number | null)[]
}
export interface WeatherFile {
  saved_at: string
  elevation?: number
  hourly: Hourly
  daily: { time: string[]; sunrise?: string[]; sunset?: string[] }
}
export interface AirFile {
  saved_at: string
  hourly?: { time: string[]; pm2_5: (number | null)[]; pm10: (number | null)[] }
}
export interface SummerFile {
  saved_at: string
  daily: { time: string[]; temperature_2m_max: (number | null)[]; apparent_temperature_max: (number | null)[] }
}
export interface SummerDayFile {
  saved_at: string
  elevation?: number
  hourly: Hourly
}

/**
 * Pure part, for tests: turn the saved files into `Loaded`. Returns null when the saved days
 * do not include `start`, so an old file is never shown as today.
 */
export function fromSnapshot(city: SnapCity, w: WeatherFile, a: AirFile | null, start: string, hourNow: number): Loaded | null {
  const dates = w.daily.time.filter((d) => d >= start)
  if (dates[0] !== start) return null
  const days = buildDays(w.hourly, a?.hourly ?? null, dates)
  if (!days.length) return null
  days.forEach((d) => {
    const i = w.daily.time.indexOf(d.date)
    d.sunrise = w.daily.sunrise?.[i]
    d.sunset = w.daily.sunset?.[i]
  })
  // "now" on saved data = the hourly value for the current IST hour
  const h = days[0].hours.find((x) => x.hour === hourNow) ?? days[0].hours[0]
  const code = w.hourly.weather_code?.[w.hourly.time.indexOf(h.time)] ?? days[0].code ?? 0
  const sr = days[0].sunrise?.slice(11, 16) ?? '06:00'
  const ss = days[0].sunset?.slice(11, 16) ?? '18:00'
  const hhmm = h.time.slice(11, 16)
  const data: Weather = {
    kind: 'live',
    lat: SNAP_AT[city].lat,
    lon: SNAP_AT[city].lon,
    elevation: w.elevation ?? null,
    current: { time: h.time, temp: h.temp, feels: h.feels, rh: h.rh, rain: h.rain, code, wind: h.wind, isDay: hhmm >= sr && hhmm < ss },
    air: h.aqi == null ? null : { aqi: h.aqi, pm25: h.pm25 ?? NaN, pm10: h.pm10 ?? NaN },
    airAvailable: days[0].hours.some((x) => x.aqi != null),
    days,
  }
  const savedAt = Date.parse(w.saved_at)
  return { data, savedAt: Number.isFinite(savedAt) ? savedAt : 0, stale: false, from: 'cache' }
}

/** Pure part: last summer's hottest day as a replay-shaped `Loaded` (for the hot-hours what-if). */
export function summerDayFrom(city: SnapCity, f: SummerDayFile): Loaded | null {
  const date = f.hourly.time[0]?.slice(0, 10)
  if (!date) return null
  const days = buildDays(f.hourly, null, [date])
  if (!days.length) return null
  const h = days[0].hours[15] ?? days[0].hours[0]
  const savedAt = Date.parse(f.saved_at)
  return {
    data: {
      kind: 'replay', replayDate: date, lat: SNAP_AT[city].lat, lon: SNAP_AT[city].lon, elevation: f.elevation ?? null,
      current: { time: h.time, temp: h.temp, feels: h.feels, rh: h.rh, rain: h.rain, code: days[0].code ?? 0, wind: h.wind, isDay: true },
      air: null, airAvailable: false, days,
    },
    savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    stale: false,
    from: 'cache',
  }
}

/** Last summer's peak for planting: highest air temperature and the hottest day by feels-like. */
export function summerPeakFrom(f: SummerFile): { peak: number; hottest: string; feels: number } | null {
  const t = f.daily.temperature_2m_max.filter((v): v is number => v != null)
  if (!t.length) return null
  const fm = f.daily.apparent_temperature_max
  let i = 0
  fm.forEach((v, j) => v != null && (fm[i] == null || v > (fm[i] as number)) && (i = j))
  return { peak: Math.max(...t), hottest: f.daily.time[i], feels: fm[i] ?? NaN }
}

// ---------- loading ----------

const files = new Map<string, Promise<unknown | null>>()
function file<T>(name: string): Promise<T | null> {
  if (!files.has(name))
    files.set(
      name,
      fetch(`/snapshots/${name}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    )
  return files.get(name) as Promise<T | null>
}

/** The saved forecast for a pilot city, starting at `start` (today in IST by default). */
export async function loadSnapshot(city: SnapCity, start = istToday()): Promise<Loaded | null> {
  const [w, a] = await Promise.all([file<WeatherFile>(`${city}-weather.json`), file<AirFile>(`${city}-air.json`)])
  return w?.hourly && w.daily ? fromSnapshot(city, w, a, start, istHour()) : null
}

/** Last summer's hottest day, hourly, saved for offline use. */
export async function loadSummerDay(city: SnapCity): Promise<Loaded | null> {
  const f = await file<SummerDayFile>(`${city}-summer-day.json`)
  return f?.hourly ? summerDayFrom(city, f) : null
}

export async function loadSummerPeak(city: SnapCity) {
  const f = await file<SummerFile>(`${city}-summer.json`)
  return f?.daily ? summerPeakFrom(f) : null
}
