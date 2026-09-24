/**
 * Basemap-agnostic map: the same deck.gl layers render over Google Maps when a key is
 * configured, otherwise over MapLibre with OpenFreeMap tiles (no key needed).
 */
import type { Layer, PickingInfo } from '@deck.gl/core'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import * as maplibregl from 'maplibre-gl'
// MapLibre v6 looks for its worker next to its own module, which does not survive bundling;
// let Vite bundle the worker and hand MapLibre the URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
const GOOGLE_MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID'
maplibregl.setWorkerUrl(maplibreWorkerUrl)

const OSM_STYLE = 'https://tiles.openfreemap.org/styles/positron'

type Tooltip = ((info: PickingInfo) => string | { html: string } | null) | undefined

interface Props {
  layers: Layer[]
  center: [number, number] // [lat, lon]
  zoom?: number
  getTooltip?: Tooltip
  className?: string
  /** register a function the parent can call to fly the camera */
  onFlyTo?: (fly: (lat: number, lon: number, zoom?: number) => void) => void
}

interface Overlay {
  setProps: (p: { layers?: Layer[]; getTooltip?: Tooltip }) => void
}

let googleFailed = false

export function MapView({ layers, center, zoom = 12, getTooltip, className, onFlyTo }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const overlay = useRef<Overlay | null>(null)
  const [basemap, setBasemap] = useState<'google' | 'osm'>(GOOGLE_KEY && !googleFailed ? 'google' : 'osm')
  const latest = useRef({ layers, getTooltip })
  latest.current = { layers, getTooltip }

  useEffect(() => {
    if (!el.current) return
    let disposed = false
    let cleanup = () => {}

    if (basemap === 'google') {
      ;(window as unknown as { gm_authFailure: () => void }).gm_authFailure = () => {
        googleFailed = true
        setBasemap('osm')
      }
      setOptions({ key: GOOGLE_KEY!, v: 'weekly', language: 'hi', region: 'IN' })
      importLibrary('maps')
        .then(({ Map }) => {
          if (disposed || !el.current) return
          const map = new Map(el.current, {
            center: { lat: center[0], lng: center[1] },
            zoom,
            mapId: GOOGLE_MAP_ID,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            gestureHandling: 'greedy',
          })
          const o = new GoogleMapsOverlay({ interleaved: false, ...latest.current })
          o.setMap(map)
          overlay.current = o
          onFlyTo?.((lat, lon, z) => {
            map.panTo({ lat, lng: lon })
            if (z) map.setZoom(z)
          })
          cleanup = () => {
            o.finalize()
          }
        })
        .catch(() => {
          googleFailed = true
          setBasemap('osm')
        })
    } else {
      const map = new maplibregl.Map({
        container: el.current,
        style: OSM_STYLE,
        center: [center[1], center[0]],
        zoom,
        attributionControl: { compact: true },
        dragRotate: false,
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      const o = new MapboxOverlay({ interleaved: false, ...latest.current })
      map.addControl(o)
      overlay.current = o
      onFlyTo?.((lat, lon, z) => map.flyTo({ center: [lon, lat], zoom: z ?? map.getZoom(), duration: 900 }))
      cleanup = () => map.remove()
    }
    return () => {
      disposed = true
      overlay.current = null
      cleanup()
    }
    // the map is created once per basemap; layer updates go through setProps below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap])

  useEffect(() => {
    overlay.current?.setProps({ layers, getTooltip })
  }, [layers, getTooltip])

  return (
    <div className={className ?? 'relative h-full'}>
      <div ref={el} className="h-full w-full" />
      <span className="pointer-events-none absolute bottom-1 left-2 rounded bg-white/80 px-1.5 text-[10px] text-ink-3">
        {basemap === 'google' ? 'Google Maps' : 'OpenFreeMap · © OpenStreetMap'}
      </span>
    </div>
  )
}
