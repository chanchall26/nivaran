/**
 * Map of points where people work outside. MapLibre with CARTO light tiles (no key).
 * Each marker is a real button with a colour and size set by the layer being shown (danger
 * today, fire risk tonight, where to plant); a flame badge marks fire risk tonight.
 */
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef } from 'react'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const NEAR_KM = 2.5

export interface MapMarker {
  id: string
  lat: number
  lon: number
  color: string
  /** diameter in px (default 20) */
  size?: number
  /** read out by screen readers and shown on hover */
  label: string
  badge?: 'fire-high' | 'fire-medium' | null
}

function circle(lat: number, lon: number, km: number, n = 64): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI
    out.push([lon + ((km / 111.32) * Math.cos(a)) / Math.cos((lat * Math.PI) / 180), lat + (km / 110.57) * Math.sin(a)])
  }
  return out
}

const FLAME =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="#fff" stroke="#fff" stroke-width="1.5" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'

export function PointsMap({
  center, markers: points, selected, onSelect, view, className,
}: {
  center: { lat: number; lon: number }
  markers: MapMarker[]
  selected: string | null
  onSelect: (id: string) => void
  view: 'near' | 'city'
  className?: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const selectRef = useRef(onSelect)
  const readyRef = useRef(false)
  const pending = useRef<(() => void)[]>([])
  selectRef.current = onSelect

  // create once
  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [center.lon, center.lat],
      zoom: 13,
      attributionControl: { compact: true, customAttribution: '© CARTO' },
      cooperativeGestures: false,
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.on('load', () => {
      m.addSource('near', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'near-fill', type: 'fill', source: 'near', paint: { 'fill-color': '#1f6feb', 'fill-opacity': 0.06 } })
      m.addLayer({ id: 'near-line', type: 'line', source: 'near', paint: { 'line-color': '#1f6feb', 'line-width': 1.5, 'line-dasharray': [3, 2] } })
      readyRef.current = true
      pending.current.splice(0).forEach((f) => f())
    })
    map.current = m
    return () => {
      markers.current.forEach((x) => x.remove())
      markers.current = []
      m.remove()
      map.current = null
      readyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // markers
  useEffect(() => {
    const m = map.current
    if (!m) return
    markers.current.forEach((x) => x.remove())
    markers.current = []
    // the place itself
    const me = document.createElement('div')
    me.className = 'size-3.5 rounded-full border-2 border-white bg-[#1f6feb] shadow'
    me.setAttribute('aria-hidden', 'true')
    markers.current.push(new maplibregl.Marker({ element: me }).setLngLat([center.lon, center.lat]).addTo(m))
    // big markers first, so small ones stay clickable on top
    for (const mp of [...points].sort((a, b) => (b.size ?? 20) - (a.size ?? 20))) {
      const b = document.createElement('button')
      b.type = 'button'
      const sel = mp.id === selected
      const size = (mp.size ?? 20) + (sel ? 6 : 0)
      b.setAttribute('aria-label', mp.label)
      b.title = mp.label
      b.style.cssText = `position:relative;width:${size}px;height:${size}px;border-radius:999px;background:${mp.color};border:${sel ? 3 : 2}px solid ${sel ? '#1B2330' : '#fff'};box-shadow:0 1px 3px rgb(0 0 0 / .35);cursor:pointer;padding:0`
      if (mp.badge) {
        const f = document.createElement('span')
        f.style.cssText = `position:absolute;top:-9px;right:-9px;width:17px;height:17px;border-radius:999px;background:${mp.badge === 'fire-high' ? '#D7263D' : '#F07F13'};display:flex;align-items:center;justify-content:center;border:1.5px solid #fff`
        f.innerHTML = FLAME
        b.appendChild(f)
      }
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        selectRef.current(mp.id)
      })
      markers.current.push(new maplibregl.Marker({ element: b }).setLngLat([mp.lon, mp.lat]).addTo(m))
    }
  }, [points, selected, center.lat, center.lon])

  // near me / whole city
  useEffect(() => {
    const m = map.current
    if (!m) return
    const apply = () => {
      // the container may have changed size since the map was made (grid layout settling)
      m.resize()
      const ring = circle(center.lat, center.lon, NEAR_KM)
      const src = m.getSource('near') as maplibregl.GeoJSONSource | undefined
      src?.setData({ type: 'FeatureCollection', features: view === 'near' ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] : [] })
      const b = new maplibregl.LngLatBounds()
      if (view === 'near') ring.forEach((c) => b.extend(c))
      else {
        b.extend([center.lon, center.lat])
        points.forEach((p) => b.extend([p.lon, p.lat]))
      }
      if (!b.isEmpty()) m.fitBounds(b, { padding: 40, maxZoom: 15, duration: 700 })
    }
    if (readyRef.current) apply()
    else pending.current.push(apply)
  }, [view, center.lat, center.lon, points])

  return <div ref={el} className={className ?? 'h-full w-full'} />
}
