/**
 * Login place picker: type a city or PIN in the box on top, or tap anywhere on the map to
 * pick that spot directly. No pre-picked city — the map opens on all of India.
 */
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { LoaderCircle, MapPin, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { isPin, lookupPin, pilotFor, reverseGeocode, searchCity, type Place } from '../lib/place'
import { ICON } from './atoms'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const INDIA = { lat: 22.9734, lon: 78.6569, zoom: 4.2 }

export function PlaceMap({ onPick, height = 'h-72' }: { onPick: (p: Place) => void; height?: string }) {
  const { t, lang } = useI18n()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState<'search' | 'pick' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const drop = (lat: number, lon: number) => {
    const m = map.current
    if (!m) return
    if (marker.current) marker.current.setLngLat([lon, lat])
    else {
      const el2 = document.createElement('div')
      el2.setAttribute('aria-hidden', 'true')
      el2.className = 'size-6 rounded-full border-[3px] border-white bg-[#22c55e] shadow-[0_0_0_5px_rgb(34_197_94/0.35)]'
      marker.current = new maplibregl.Marker({ element: el2 }).setLngLat([lon, lat]).addTo(m)
    }
  }

  const choose = async (lat: number, lon: number) => {
    drop(lat, lon)
    setBusy('pick')
    setErr(null)
    try {
      const n = await reverseGeocode(lat, lon)
      onPick({ ...n, lat, lon, pilot: pilotFor(lat, lon), source: 'search' })
    } catch {
      setErr(t.picker.netErr)
    } finally {
      setBusy(null)
    }
  }
  const chooseRef = useRef(choose)
  chooseRef.current = choose

  const fly = (p: Place) => {
    map.current?.flyTo({ center: [p.lon, p.lat], zoom: 12, duration: 700 })
    drop(p.lat, p.lon)
    setQ('')
    setResults(null)
    onPick(p)
  }

  // create the map once
  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [INDIA.lon, INDIA.lat],
      zoom: INDIA.zoom,
      attributionControl: { compact: true, customAttribution: '© CARTO' },
      cooperativeGestures: false,
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.on('click', (e) => chooseRef.current(e.lngLat.lat, e.lngLat.lng))
    map.current = m
    return () => {
      marker.current = null
      m.remove()
      map.current = null
    }
  }, [])

  // PIN or city search while typing
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2 || (/^\d+$/.test(query) && !isPin(query))) {
      setResults(null)
      return
    }
    let off = false
    const id = setTimeout(async () => {
      setBusy('search')
      setErr(null)
      try {
        if (isPin(query)) {
          const pl = await lookupPin(query)
          if (off) return
          if (pl) fly(pl)
          else setErr(t.picker.pinErr)
        } else {
          const r = await searchCity(query)
          if (off) return
          setResults(r)
          if (!r.length) setErr(t.picker.noResults)
        }
      } catch {
        if (!off) setErr(navigator.onLine ? t.picker.noResults : t.picker.netErr)
      } finally {
        if (!off) setBusy(null)
      }
    }, 350)
    return () => {
      off = true
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, t])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line">
      <div ref={el} className={`w-full ${height}`} />
      <div className="absolute inset-x-2 top-2">
        <label className="relative block">
          <span className="sr-only">{t.picker.search}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" {...ICON} aria-hidden />
          <input
            className="field !h-10 !pl-9 shadow-lg"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.picker.search}
            autoComplete="off"
            inputMode="search"
            enterKeyHint="search"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results?.[0]) {
                e.preventDefault()
                fly(results[0])
              }
            }}
          />
          {busy === 'search' && <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted" {...ICON} aria-hidden />}
        </label>
        {results && results.length > 0 && (
          <ul className="pop-in mt-1 max-h-52 overflow-y-auto rounded-xl border border-line bg-[#06152d] shadow-xl">
            {results.map((r) => (
              <li key={`${r.lat},${r.lon},${r.name}`}>
                <button type="button" onClick={() => fly(r)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5">
                  <MapPin className="size-4 shrink-0 text-[#4ade80]" {...ICON} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{lang === 'hi' ? r.nameHi : r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {busy === 'pick' && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#06152d]/90 px-3 py-1.5 text-xs font-semibold shadow">
          <LoaderCircle className="mr-1 inline size-3.5 animate-spin" {...ICON} aria-hidden /> {t.picker.locating}
        </div>
      )}
      {err && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 max-w-[90%] rounded-full bg-[#3b1520]/95 px-3 py-1.5 text-xs font-medium text-[#fecdd3] shadow">
          {err}
        </div>
      )}
    </div>
  )
}
