import type { HourlyWeather, Season, WeatherSource, WeatherSummary } from './types'

const HOURLY =
  'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,boundary_layer_height,shortwave_radiation'

const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return NaN
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const min = (xs: number[]) => Math.min(...xs.filter(Number.isFinite))
const max = (xs: number[]) => Math.max(...xs.filter(Number.isFinite))
const mean = (xs: number[]) => {
  const f = xs.filter(Number.isFinite)
  return f.reduce((a, b) => a + b, 0) / f.length
}

function addDays(isoDate: string, n: number) {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Indices of hours in [from, to) given local ISO timestamps like 2026-01-05T20:00. */
function window(h: HourlyWeather, from: string, to: string) {
  const out: number[] = []
  h.time.forEach((t, i) => {
    if (t >= from && t < to) out.push(i)
  })
  return out
}

/**
 * Reduce hourly weather to the numbers the scores use.
 * Night = 20:00 on `nightOf` to 07:00 next morning; day = 11:00-17:00 on `dayOf`.
 * Ventilation coefficient = boundary-layer height (m) x wind speed (m/s).
 */
export function summarise(
  h: HourlyWeather,
  opts: { source: WeatherSource; label: string; nightOf: string; dayOf: string },
): WeatherSummary {
  const night = window(h, `${opts.nightOf}T20:00`, `${addDays(opts.nightOf, 1)}T07:00`)
  const day = window(h, `${opts.dayOf}T11:00`, `${opts.dayOf}T17:00`)
  const pick = (arr: (number | null)[] | undefined, idx: number[]) =>
    idx.map((i) => arr?.[i] ?? NaN).filter((v): v is number => Number.isFinite(v))

  const vc = night.map((i) => h.boundary_layer_height[i] * h.wind_speed_10m[i])
  const pmNight = pick(h.pm2_5, night)
  const pmDay = pick(h.pm2_5, day)
  return {
    source: opts.source,
    label: opts.label,
    date: opts.nightOf,
    nightMinTemp: min(pick(h.temperature_2m, night)),
    nightMinFeels: min(pick(h.apparent_temperature, night)),
    ventilation: median(vc),
    nightMinBlh: min(pick(h.boundary_layer_height, night)),
    nightMeanWind: mean(pick(h.wind_speed_10m, night)),
    dayMaxTemp: max(pick(h.temperature_2m, day)),
    dayMaxFeels: max(pick(h.apparent_temperature, day)),
    dayMeanHumidity: mean(pick(h.relative_humidity_2m, day)),
    pm25: pmNight.length ? max(pmNight) : pmDay.length ? max(pmDay) : null,
    hourly: h,
  }
}

function localDate(offsetDays = 0) {
  // Asia/Kolkata calendar date, independent of the viewer's timezone
  const d = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

export async function fetchLive(lat: number, lon: number): Promise<WeatherSummary> {
  const base = `latitude=${lat}&longitude=${lon}&timezone=Asia%2FKolkata`
  const [w, aq] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${base}&hourly=${HOURLY}&wind_speed_unit=ms&forecast_days=3`).then(
      (r) => {
        if (!r.ok) throw new Error(`Open-Meteo ${r.status}`)
        return r.json()
      },
    ),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${base}&hourly=pm2_5&forecast_days=3`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ])
  const hourly: HourlyWeather = { ...w.hourly, pm2_5: aq?.hourly?.pm2_5 }
  const today = localDate()
  return summarise(hourly, { source: 'live', label: 'Aaj raat / aaj (live forecast)', nightOf: today, dayOf: today })
}

interface ReplayFile {
  source: string
  sardi: { label: string; night: string; hourly: HourlyWeather }
  garmi: { label: string; day: string; hourly: HourlyWeather }
}

export async function fetchReplay(season: Season): Promise<WeatherSummary> {
  const r: ReplayFile = await fetch('/data/gwalior/replay.json').then((x) => x.json())
  if (season === 'sardi') {
    // the file's "night" is the morning the minimum occurred; the night starts the evening before
    const nightOf = addDays(r.sardi.night, -1)
    return summarise(r.sardi.hourly, { source: 'replay', label: r.sardi.label, nightOf, dayOf: nightOf })
  }
  return summarise(r.garmi.hourly, { source: 'replay', label: r.garmi.label, nightOf: r.garmi.day, dayOf: r.garmi.day })
}

/**
 * Planning baseline: a typical January night / May afternoon in Gwalior, so the
 * structural map stays meaningful in any month. Values are round-number climatology.
 */
export function typical(): WeatherSummary {
  return {
    source: 'typical',
    label: 'Aam January raat / aam May din (planning)',
    date: '',
    nightMinTemp: 7,
    nightMinFeels: 6,
    ventilation: 400,
    nightMinBlh: 60,
    nightMeanWind: 0.8,
    dayMaxTemp: 42,
    dayMaxFeels: 43,
    dayMeanHumidity: 22,
    pm25: 110,
  }
}

export function defaultSeason(date = new Date()): Season {
  const m = date.getMonth() + 1
  return m >= 10 || m <= 2 ? 'sardi' : 'garmi'
}
