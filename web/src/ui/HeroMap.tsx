/**
 * The satellite map at the top of the worker screen: the place with its name card, one landmark,
 * zoom and locate buttons, and "click the map to change place". Satellite: Sentinel-2 cloudless
 * by EOX (Copernicus Sentinel data); labels from CARTO's vector Dark Matter style on OpenStreetMap. No keys.
 */
import { LocateFixed, Minus, Plus } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, type ReactNode } from 'react'
import { ICON } from './atoms'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

/** Place names come from CARTO's vector Dark Matter style (no key): only its label layers are kept. */
const LABELS_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const SAT: maplibregl.RasterSourceSpecification = {
  type: 'raster',
  tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'],
  tileSize: 256,
  maxzoom: 15,
  attribution: 'Sentinel-2 cloudless 2020 by <a href="https://s2maps.eu" target="_blank" rel="noreferrer">EOX</a> (Copernicus Sentinel data)',
}
const SAT_PAINT = { 'raster-brightness-max': 0.72, 'raster-saturation': -0.15, 'raster-contrast': 0.08 }

/** Satellite underneath, then only the label layers of the vector style on top. */
async function heroStyle(): Promise<maplibregl.StyleSpecification> {
  const base: maplibregl.StyleSpecification = {
    version: 8,
    sources: { sat: SAT },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#04142b' } },
      { id: 'sat', type: 'raster', source: 'sat', paint: SAT_PAINT },
    ],
  }
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 6000)
    const s = (await fetch(LABELS_STYLE, { signal: ctl.signal }).then((r) => r.json())) as maplibregl.StyleSpecification
    clearTimeout(timer)
    const labels = s.layers.filter((l) => l.type === 'symbol')
    return { ...s, sources: { ...s.sources, sat: SAT }, layers: [...base.layers, ...labels] }
  } catch {
    // offline or blocked: satellite alone still shows where the place is
    return base
  }
}

export interface HeroPin {
  lat: number
  lon: number
  /** the marker's own HTML (pin + card), built by the caller */
  el: HTMLElement
}

export function HeroMap({
  center, pins, keep, onPick, onLocate, children, className, zoom = 12.3,
}: {
  center: { lat: number; lon: number }
  pins: HeroPin[]
  /** a second spot (a landmark) kept in view with the place, when the map is tall enough */
  keep?: { lat: number; lon: number } | null
  /** click on the map: change place there */
  onPick?: (lat: number, lon: number) => void
  onLocate?: () => void
  /** overlays drawn over the map (status pill, hints) */
  children?: ReactNode
  className?: string
  zoom?: number
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#04142b' } }] },
      center: [center.lon, center.lat],
      zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    m.touchZoomRotate.disableRotation()
    m.on('click', (e) => pick.current?.(e.lngLat.lat, e.lngLat.lng))
    heroStyle().then((s) => map.current === m && m.setStyle(s))
    map.current = m
    return () => {
      markers.current.forEach((x) => x.remove())
      markers.current = []
      m.remove()
      map.current = null
    }
    // the map is made once; the camera follows the place below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const first = useRef(true)
  const kLat = keep?.lat
  const kLon = keep?.lon
  useEffect(() => {
    const m = map.current
    if (!m) return
    const h = m.getContainer().clientHeight
    // the place sits a little low, so its name card clears the status pill at the top
    let cam: maplibregl.EaseToOptions = { center: [center.lon, center.lat], zoom, offset: [0, Math.max(0, Math.min(40, 200 - h / 2))] }
    if (kLat != null && kLon != null && h >= 300) {
      const b = new maplibregl.LngLatBounds([center.lon, center.lat], [center.lon, center.lat]).extend([kLon, kLat])
      // room above for the pill (landmark on top) or for the name card (place on top), and for the credits below
      const padding = kLat >= center.lat ? { top: 100, bottom: 60, left: 180, right: 180 } : { top: 200, bottom: 50, left: 180, right: 180 }
      const fit = m.cameraForBounds(b, { padding, maxZoom: zoom })
      if (fit?.center && fit.zoom != null) cam = { center: fit.center, zoom: fit.zoom }
    }
    m.easeTo({ ...cam, duration: first.current ? 0 : 900 })
    first.current = false
  }, [center.lat, center.lon, kLat, kLon, zoom])

  useEffect(() => {
    const m = map.current
    if (!m) return
    markers.current.forEach((x) => x.remove())
    markers.current = pins.map((p) => {
      // clicks on a marker should not also move the place
      p.el.addEventListener('click', (e) => e.stopPropagation())
      return new maplibregl.Marker({ element: p.el, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(m)
    })
  }, [pins])

  const btn = 'grid size-11 place-items-center rounded-xl border border-[#1e3a6b] bg-[#06152d]/92 text-white shadow-lg hover:border-[#38bdf8]'
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[#16325c] ${className ?? ''}`}>
      {/* MapLibre makes its container position: relative, so it must fill by size, not by inset */}
      <div ref={el} className="h-full w-full cursor-crosshair" />
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button type="button" className={btn} aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <Plus className="size-5" {...ICON} aria-hidden />
        </button>
        <button type="button" className={btn} aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <Minus className="size-5" {...ICON} aria-hidden />
        </button>
        {onLocate && (
          <button type="button" className={`${btn} mt-2`} aria-label="Use my location" onClick={onLocate}>
            <LocateFixed className="size-5" {...ICON} aria-hidden />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
