/**
 * Map of pollution hotspots. Same MapLibre + CARTO Dark Matter setup as ui/PointsMap.tsx
 * (Track 1's people-map), kept as its own file so this track can build and test standalone.
 * Marker size follows confidence (how sure we are), colour follows severity (how bad).
 */
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef } from 'react'
import { SEVERITY_COLOR, type Hotspot } from '../lib/hotspot'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

function sizeFor(confidence: number) {
  return 16 + Math.round((confidence / 100) * 20)
}

export function HotspotMap({
  hotspots, selected, onSelect, className,
}: {
  hotspots: Hotspot[]
  selected: string | null
  onSelect: (id: string) => void
  className?: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const selectRef = useRef(onSelect)
  const readyRef = useRef(false)
  const pending = useRef<(() => void)[]>([])
  selectRef.current = onSelect

  useEffect(() => {
    if (!el.current) return
    const center = hotspots[0] ?? { lon: 77.1, lat: 28.6 }
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [center.lon, center.lat],
      zoom: 7,
      attributionControl: { compact: true, customAttribution: '© CARTO' },
      cooperativeGestures: false,
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.on('load', () => {
      readyRef.current = true
      pending.current.splice(0).forEach((fn) => fn())
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

  useEffect(() => {
    const m = map.current
    if (!m) return
    const apply = () => {
      markers.current.forEach((x) => x.remove())
      markers.current = []
      for (const h of hotspots) {
        const b = document.createElement('button')
        b.type = 'button'
        const sel = h.id === selected
        const size = sizeFor(h.confidence) + (sel ? 6 : 0)
        b.setAttribute('aria-label', `${h.place}, ${h.severity} severity, confidence ${h.confidence}`)
        b.title = h.place
        b.style.cssText = `width:${size}px;height:${size}px;border-radius:999px;background:${SEVERITY_COLOR[h.severity]};border:${sel ? 3 : 2}px solid #fff;box-shadow:${sel ? '0 0 0 4px #38bdf8, 0 2px 10px rgb(0 0 0 / .6)' : '0 1px 4px rgb(0 0 0 / .6)'};cursor:pointer;padding:0`
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          selectRef.current(h.id)
        })
        markers.current.push(new maplibregl.Marker({ element: b }).setLngLat([h.lon, h.lat]).addTo(m))
      }
      m.resize()
      if (hotspots.length) {
        const b = new maplibregl.LngLatBounds()
        hotspots.forEach((h) => b.extend([h.lon, h.lat]))
        m.fitBounds(b, { padding: 60, maxZoom: 9, duration: 500 })
      }
    }
    if (readyRef.current) apply()
    else pending.current.push(apply)
  }, [hotspots, selected])

  return <div ref={el} className={className ?? 'h-full w-full'} />
}
