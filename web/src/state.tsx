import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { computeNorms, type Norms } from './lib/scoring'
import { store, type CollectionName } from './lib/store'
import type { Cell, CityMeta, Delivery, Place, PulseCheck, Report, Season, WeatherSource, WeatherSummary } from './lib/types'
import { defaultSeason, fetchLive, fetchReplay, typical } from './lib/weather'

interface CityData {
  meta: CityMeta
  cells: Cell[]
  places: Place[]
  boundary: GeoJSON.Feature
  norms: Norms
}

interface AppState {
  city: CityData | null
  cityError: string | null
  season: Season
  setSeason: (s: Season) => void
  weatherSource: WeatherSource
  setWeatherSource: (s: WeatherSource) => void
  weather: WeatherSummary
  weatherLoading: boolean
  weatherError: string | null
  typicalWeather: WeatherSummary
  reports: Report[]
  deliveries: Delivery[]
  pulses: PulseCheck[]
}

const Ctx = createContext<AppState | null>(null)

const SEASON_KEY = 'barahmasa:season'
const SOURCE_KEY = 'barahmasa:weatherSource'
const readPref = <T extends string>(k: string, fallback: T, allowed: T[]): T => {
  try {
    const v = localStorage.getItem(k) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
const writePref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* private mode: preference just isn't remembered */
  }
}

function useCollection<T>(name: CollectionName): T[] {
  const [rows, setRows] = useState<T[]>([])
  useEffect(() => store.subscribe(name, (r) => setRows(r as T[])), [name])
  return rows
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [city, setCity] = useState<CityData | null>(null)
  const [cityError, setCityError] = useState<string | null>(null)
  const [season, setSeasonRaw] = useState<Season>(() => readPref(SEASON_KEY, defaultSeason(), ['garmi', 'sardi']))
  const [weatherSource, setSourceRaw] = useState<WeatherSource>(() =>
    readPref(SOURCE_KEY, 'replay', ['live', 'replay', 'typical']),
  )
  const typicalWeather = useMemo(() => typical(), [])
  // fetched summaries keyed by `${source}:${season}`; 'typical' needs no fetch
  const [fetched, setFetched] = useState<Record<string, WeatherSummary | { error: string }>>({})
  const key = weatherSource === 'replay' ? `replay:${season}` : weatherSource
  const entry = weatherSource === 'typical' ? typicalWeather : fetched[key]
  const weather: WeatherSummary = entry && !('error' in entry) ? entry : typicalWeather
  const weatherLoading = weatherSource !== 'typical' && !entry
  const weatherError =
    entry && 'error' in entry ? `Weather load nahi hua (${entry.error}); planning values dikh rahe hain.` : null

  const reports = useCollection<Report>('reports')
  const deliveries = useCollection<Delivery>('deliveries')
  const pulses = useCollection<PulseCheck>('pulses')

  useEffect(() => {
    const get = (f: string) =>
      fetch(`/data/gwalior/${f}`).then((r) => {
        if (!r.ok) throw new Error(`${f}: ${r.status}`)
        return r.json()
      })
    Promise.all([get('meta.json'), get('cells.json'), get('places.json'), get('boundary.json')])
      .then(([meta, cells, places, boundary]) => setCity({ meta, cells, places, boundary, norms: computeNorms(cells) }))
      .catch((e) => setCityError(String(e)))
  }, [])

  useEffect(() => {
    if (weatherSource === 'typical' || fetched[key]) return
    let cancelled = false
    const p = weatherSource === 'live' ? fetchLive(26.2124, 78.1772) : fetchReplay(season)
    p.then((w) => !cancelled && setFetched((f) => ({ ...f, [key]: w })))
      .catch((e) => !cancelled && setFetched((f) => ({ ...f, [key]: { error: String(e?.message ?? e) } })))
    return () => {
      cancelled = true
    }
  }, [weatherSource, season, key, fetched])

  const value: AppState = {
    city, cityError, season,
    setSeason: (s) => {
      setSeasonRaw(s)
      writePref(SEASON_KEY, s)
    },
    weatherSource,
    setWeatherSource: (s) => {
      setSourceRaw(s)
      writePref(SOURCE_KEY, s)
    },
    weather, weatherLoading, weatherError, typicalWeather, reports, deliveries, pulses,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}
