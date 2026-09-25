/**
 * App state: the selected place, the day being shown, live (or replayed) weather + air,
 * map points, and who is using the app. The URL carries place / date / replay so any view
 * can be shared.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { addDays, istHour, istToday, isIsoDate } from './lib/ist'
import { loadLive, loadReplay, prefetch, pruneCache, REPLAY_KINDS, type Loaded, type ReplayKind } from './lib/live'
import {
  DEFAULT_PLACE, lookupPin, pilotFor, placeId, placeParams, PRESETS, rememberPlace, reverseGeocode, savedPlace, snapCityFor, validLatLon, type Place,
} from './lib/place'
import { loadSnapshot } from './lib/snapshot'
import { loadCurated, loadOsmCached, type Point } from './lib/points'
import { loadProfile, saveProfile, type Profile } from './lib/profile'
import { modesOf, type Day, type Mode } from './lib/risk'

interface PointsState {
  points: Point[] | null
  status: 'loading' | 'ok' | 'error'
  /** curated pilot points vs. live OSM with default counts */
  kind: 'curated' | 'osm'
}

interface AppCtx {
  place: Place
  setPlace: (p: Place, opts?: { replay?: ReplayKind | null }) => void
  replay: ReplayKind | null
  setReplay: (r: ReplayKind | null) => void
  /** first day shown ("Today"): IST today, a demo ?date, or the replay date */
  startDate: string
  wx: Loaded | null
  wxStatus: 'loading' | 'ok' | 'error'
  refresh: () => void
  pts: PointsState
  profile: Profile | null
  setProfile: (p: Profile | null) => void
  dayIdx: 0 | 1
  setDayIdx: (i: 0 | 1) => void
}

const Ctx = createContext<AppCtx | null>(null)

const REPLAY_PARAM = (v: string | null): ReplayKind | null => (REPLAY_KINDS.includes(v as ReplayKind) ? (v as ReplayKind) : null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const [place, setPlaceRaw] = useState<Place>(() => savedPlace() ?? DEFAULT_PLACE)
  const [replay, setReplayRaw] = useState<ReplayKind | null>(() => REPLAY_PARAM(params.get('replay')))
  const [profile, setProfileRaw] = useState<Profile | null>(loadProfile)
  const [dayIdx, setDayIdx] = useState<0 | 1>(0)
  const [wx, setWx] = useState<Loaded | null>(null)
  const [wxStatus, setWxStatus] = useState<AppCtx['wxStatus']>('loading')
  const [tick, setTick] = useState(0)
  const [force, setForce] = useState(false)
  const [pts, setPts] = useState<PointsState>({ points: null, status: 'loading', kind: 'curated' })

  const qDate = params.get('date')
  const today = istToday()
  // a demo ?date must sit inside the forecast range (the forecast answers 16 days ahead)
  const liveStart = isIsoDate(qDate) && qDate >= addDays(today, -30) && qDate <= addDays(today, 9) ? qDate : today

  // ---- URL -> place, once on load ----
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const pin = params.get('pin')
    const lat = Number(params.get('lat'))
    const lon = Number(params.get('lon'))
    if (pin) {
      lookupPin(pin).then((p) => p && setPlaceRaw(p)).catch(() => {})
    } else if (params.get('lat') && validLatLon(lat, lon)) {
      const preset = Object.values(PRESETS).find((p) => Math.abs(p.lat - lat) < 1e-3 && Math.abs(p.lon - lon) < 1e-3)
      if (preset) setPlaceRaw(preset)
      else
        reverseGeocode(lat, lon)
          .then((n) => setPlaceRaw({ ...n, lat, lon, pilot: pilotFor(lat, lon), source: 'search' }))
          .catch(() => setPlaceRaw({ name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, nameHi: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon, pilot: pilotFor(lat, lon), source: 'search' }))
    }
    pruneCache()
    prefetch(Object.values(PRESETS), today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const writeUrl = useCallback(
    (p: Place, r: ReplayKind | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams()
          for (const [k, v] of Object.entries(placeParams(p))) next.set(k, v)
          const d = prev.get('date')
          if (d) next.set('date', d)
          if (r) next.set('replay', r)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setPlace = useCallback(
    (p: Place, opts?: { replay?: ReplayKind | null }) => {
      const r = opts && 'replay' in opts ? (opts.replay ?? null) : null
      setPlaceRaw(p)
      setReplayRaw(r)
      setDayIdx(0)
      rememberPlace(p)
      writeUrl(p, r)
    },
    [writeUrl],
  )
  const setReplay = useCallback(
    (r: ReplayKind | null) => {
      setReplayRaw(r)
      setDayIdx(0)
      writeUrl(place, r)
    },
    [place, writeUrl],
  )

  // keep the URL in step with the place when it came from storage
  useEffect(() => {
    if (!params.get('pin') && !params.get('lat')) writeUrl(place, replay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- weather + air ----
  const key = `${placeId(place)}|${replay ?? liveStart}`
  useEffect(() => {
    let off = false
    setWxStatus('loading')
    // a demo ?date: "now" is this hour on that day, not the real current reading
    const shift = (l: Loaded): Loaded => {
      if (replay || liveStart === today || !l.data.days[0]) return l
      const h = l.data.days[0].hours[istHour()] ?? l.data.days[0].hours[0]
      return { ...l, data: { ...l.data, current: { ...l.data.current, time: h.time, temp: h.temp, feels: h.feels, rh: h.rh, rain: h.rain, wind: h.wind } } }
    }
    // saved forecast in the app (public/snapshots): Delhi and Leh open on it at once and then try
    // live; every pilot place falls back to it when there is no network and nothing on the device
    const snap = replay ? null : snapCityFor(place)
    let settled = false
    if (snap && snap !== 'gwalior' && !force)
      loadSnapshot(snap, liveStart).then((s) => {
        if (off || settled || !s) return
        setWx(shift(s))
        setWxStatus('ok')
      })
    const p = replay ? loadReplay(replay, place.lat, place.lon) : loadLive(place.lat, place.lon, liveStart, force)
    p.then((l) => {
      if (off) return
      settled = true
      setWx(shift(l))
      setWxStatus('ok')
      // shown from the saved copy ("Saved forecast"): fetch a fresh one quietly, then it turns "Live"
      if (!replay && l.from === 'cache' && !l.stale)
        loadLive(place.lat, place.lon, liveStart, true)
          .then((fresh) => !off && fresh.from === 'network' && setWx(shift(fresh)))
          .catch(() => {})
    }).catch(async () => {
      if (off) return
      settled = true
      const s = snap ? await loadSnapshot(snap, liveStart).catch(() => null) : null
      if (off) return
      // offline: the saved forecast, with the "No internet" line
      setWx(s ? shift({ ...s, stale: true }) : null)
      setWxStatus(s ? 'ok' : 'error')
    })
    setForce(false)
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick])

  // refresh live data every 30 minutes
  useEffect(() => {
    if (replay) return
    const id = setInterval(() => setTick((n) => n + 1), 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [replay])

  // ---- map points ----
  const pilot = place.pilot
  const ptsKey = pilot ?? placeId(place)
  useEffect(() => {
    let off = false
    setPts((s) => ({ ...s, status: 'loading' }))
    const p = pilot
      ? loadCurated(pilot).then((points) => ({ points, kind: 'curated' as const }))
      : loadOsmCached(place.lat, place.lon).then((r) => ({ points: r.points, kind: 'osm' as const }))
    p.then((r) => !off && setPts({ points: r.points, status: 'ok', kind: r.kind })).catch(
      () => !off && setPts({ points: null, status: 'error', kind: pilot ? 'curated' : 'osm' }),
    )
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptsKey])

  const value = useMemo<AppCtx>(
    () => ({
      place, setPlace, replay, setReplay,
      startDate: wx?.data.replayDate ?? (replay ? '' : liveStart),
      wx, wxStatus,
      refresh: () => {
        setForce(true)
        setTick((n) => n + 1)
      },
      pts,
      profile,
      setProfile: (p) => {
        setProfileRaw(p)
        saveProfile(p)
      },
      dayIdx, setDayIdx,
    }),
    [place, setPlace, replay, setReplay, wx, wxStatus, liveStart, pts, profile, dayIdx],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}

/** The day being shown (0 today, 1 tomorrow) plus the day after it, and its modes. */
export function useDay(idx?: 0 | 1): { day: Day | null; next: Day | undefined; modes: Mode[]; date: string } {
  const { wx, dayIdx, startDate } = useApp()
  const i = idx ?? dayIdx
  const day = wx?.data.days[i] ?? null
  return {
    day,
    next: wx?.data.days[i + 1],
    modes: day ? modesOf(day) : ['mild'],
    date: day?.date ?? (startDate ? addDays(startDate, i) : ''),
  }
}
