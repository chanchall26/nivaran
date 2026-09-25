/**
 * Places: presets, GPS + reverse geocoding, city search and 6-digit PIN lookup.
 * All free, no keys: Open-Meteo geocoding, BigDataCloud reverse geocoding, India Post PIN data.
 */

import { SNAP_AT, type SnapCity } from './snapshot'

export type Pilot = 'gwalior' | 'delhi' | 'leh'
export interface Place {
  name: string
  nameHi: string
  lat: number
  lon: number
  pin?: string
  /** district / state line under search results */
  region?: string
  pilot: Pilot | null
  source: 'gps' | 'search' | 'pin' | 'preset'
}

export const PRESETS = {
  gwalior: { name: 'Shinde Ki Chhawani, Gwalior', nameHi: 'शिंदे की छावनी, ग्वालियर', lat: 26.178647, lon: 78.144908, pin: '474001', region: 'Madhya Pradesh', pilot: 'gwalior', source: 'preset' },
  delhi: { name: 'Connaught Place, Delhi', nameHi: 'कनॉट प्लेस, दिल्ली', lat: 28.6315, lon: 77.2167, pin: '110001', region: 'Delhi', pilot: 'delhi', source: 'preset' },
  leh: { name: 'Leh', nameHi: 'लेह', lat: 34.1526, lon: 77.5771, pin: '194101', region: 'Ladakh', pilot: 'leh', source: 'preset' },
} satisfies Record<string, Place>
export type PresetKey = keyof typeof PRESETS
export const DEFAULT_PLACE: Place = PRESETS.gwalior

/** A real point on Earth (a bad ?lat=95 in a shared link must not reach the map). */
export const validLatLon = (lat: unknown, lon: unknown): boolean =>
  typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

export function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const p = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * p) / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(((bLon - aLon) * p) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Gwalior, Delhi and Leh have curated points; everything else gets OSM points. */
export function pilotFor(lat: number, lon: number): Pilot | null {
  if (km(lat, lon, 26.2183, 78.1828) < 25) return 'gwalior'
  if (km(lat, lon, 28.6315, 77.2167) < 30) return 'delhi'
  if (km(lat, lon, 34.1526, 77.5771) < 30) return 'leh'
  return null
}

async function getJson<T>(url: string, ms = 8000): Promise<T> {
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

// ---------- GPS ----------

export function currentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('no geolocation'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  })
}

interface Bdc {
  city?: string
  locality?: string
  principalSubdivision?: string
  postcode?: string
  localityInfo?: { administrative?: { name: string; order: number }[] }
}
const bdcUrl = (lat: number, lon: number, lang: string) =>
  `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`
function bdcName(r: Bdc) {
  const loc = r.locality && r.city && r.locality !== r.city ? `${r.locality}, ${r.city}` : r.city || r.locality
  return loc || r.principalSubdivision || ''
}

/** Name for coordinates, in English and Hindi. Falls back to the coordinates themselves. */
export async function reverseGeocode(lat: number, lon: number): Promise<Pick<Place, 'name' | 'nameHi' | 'region' | 'pin'>> {
  const [en, hi] = await Promise.all([getJson<Bdc>(bdcUrl(lat, lon, 'en')).catch(() => null), getJson<Bdc>(bdcUrl(lat, lon, 'hi')).catch(() => null)])
  const fallback = `${lat.toFixed(3)}, ${lon.toFixed(3)}`
  const name = (en && bdcName(en)) || fallback
  return { name, nameHi: (hi && bdcName(hi)) || name, region: en?.principalSubdivision, pin: en?.postcode || undefined }
}

export async function placeFromGps(): Promise<Place> {
  const { lat, lon } = await currentPosition()
  const n = await reverseGeocode(lat, lon)
  return { ...n, lat, lon, pilot: pilotFor(lat, lon), source: 'gps' }
}

// ---------- city search ----------

interface OmGeo {
  results?: { id: number; name: string; latitude: number; longitude: number; admin1?: string; admin2?: string; postcodes?: string[] }[]
}

export async function searchCity(q: string): Promise<Place[]> {
  const enc = encodeURIComponent(q.trim())
  const [en, hi] = await Promise.all([
    getJson<OmGeo>(`https://geocoding-api.open-meteo.com/v1/search?name=${enc}&count=5&language=en&countryCode=IN`),
    getJson<OmGeo>(`https://geocoding-api.open-meteo.com/v1/search?name=${enc}&count=5&language=hi&countryCode=IN`).catch(() => ({}) as OmGeo),
  ])
  const hiById = new Map((hi.results ?? []).map((r) => [r.id, r]))
  // villages that share a name and district look identical in a list: keep the first
  const seen = new Set<string>()
  const rows = (en.results ?? []).filter((r) => {
    const k = `${r.name}|${r.admin2}|${r.admin1}`
    return !seen.has(k) && seen.add(k)
  })
  return rows.map((r) => {
    const h = hiById.get(r.id)
    // Open-Meteo often has no Hindi name; only use it when it is actually in Devanagari
    const nameHi = h && /[ऀ-ॿ]/.test(h.name) ? h.name : r.name
    return {
      name: r.name, nameHi, lat: r.latitude, lon: r.longitude,
      region: [r.admin2 && r.admin2 !== r.name ? r.admin2 : null, r.admin1].filter(Boolean).join(', '),
      pin: r.postcodes?.[0], pilot: pilotFor(r.latitude, r.longitude), source: 'search' as const,
    }
  })
}

/** Try to get a Hindi name for a place picked from search (Open-Meteo rarely has one). */
export async function withHindiName(p: Place): Promise<Place> {
  if (/[ऀ-ॿ]/.test(p.nameHi)) return p
  const hi = await getJson<Bdc>(bdcUrl(p.lat, p.lon, 'hi'), 5000).catch(() => null)
  const n = hi?.city || hi?.locality
  return n && /[ऀ-ॿ]/.test(n) ? { ...p, nameHi: n } : p
}

// ---------- PIN ----------

interface PinRow {
  lat: number
  lon: number
  name: string
  nameHi?: string
  district: string
  state: string
}
let pins: Promise<Record<string, PinRow>> | null = null
const loadPins = () => (pins ??= getJson<Record<string, PinRow>>('/data/pins.json').catch(() => ({}) as Record<string, PinRow>))

interface PostalPin {
  Status: string
  PostOffice?: { Name: string; District: string; State: string }[] | null
}

export const isPin = (q: string) => /^[1-9]\d{5}$/.test(q.trim())

export async function lookupPin(pin: string): Promise<Place | null> {
  pin = pin.trim()
  const row = (await loadPins())[pin]
  if (row) {
    const name = row.district && !row.name.includes(row.district) ? `${row.name}, ${row.district}` : row.name
    return {
      name, nameHi: row.nameHi ?? name, lat: row.lat, lon: row.lon, pin, region: row.state,
      pilot: pilotFor(row.lat, row.lon), source: 'pin',
    }
  }
  // not in our list: India Post names, then geocode the district
  const r = await getJson<PostalPin[]>(`https://api.postalpincode.in/pincode/${pin}`).catch(() => null)
  const po = r?.[0]?.PostOffice?.[0]
  if (!po) return null
  const hits = await searchCity(po.District).catch(() => [])
  const hit = hits.find((h) => h.region?.includes(po.State)) ?? hits[0]
  if (!hit) return null
  return withHindiName({ ...hit, name: `${po.Name}, ${po.District}`, nameHi: hit.nameHi, pin, region: po.State, source: 'pin' })
}

/** The saved forecast (public/snapshots) that fits this place: pilot cities, within 5 km of where it was taken. */
export function snapCityFor(p: Pick<Place, 'lat' | 'lon' | 'pilot'>): SnapCity | null {
  if (!p.pilot) return null
  const at = SNAP_AT[p.pilot]
  return km(p.lat, p.lon, at.lat, at.lon) < 5 ? p.pilot : null
}

// ---------- remembered + shared ----------

const KEY = 'bm:place'
const RECENT = 'bm:recent'

export function savedPlace(): Place | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Place | null
    // pilot cities can be added after a place was saved
    return p && validLatLon(p.lat, p.lon) && typeof p.name === 'string' ? { ...p, nameHi: p.nameHi || p.name, pilot: pilotFor(p.lat, p.lon) } : null
  } catch {
    return null
  }
}
export function rememberPlace(p: Place) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
    const rec = recentPlaces().filter((r) => r.name !== p.name)
    localStorage.setItem(RECENT, JSON.stringify([p, ...rec].slice(0, 5)))
  } catch {
    /* not remembered */
  }
}
export function recentPlaces(): Place[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT) ?? '[]') as unknown
    return Array.isArray(list) ? (list as Place[]).filter((p) => p && validLatLon(p.lat, p.lon) && typeof p.name === 'string') : []
  } catch {
    return []
  }
}

/** URL params for a place: ?pin=474001 when we have a PIN, else ?lat=..&lon=.. */
export function placeParams(p: Place): Record<string, string> {
  return p.pin && (p.source === 'pin' || p.source === 'preset') ? { pin: p.pin } : { lat: p.lat.toFixed(5), lon: p.lon.toFixed(5) }
}
export const placeId = (p: Place) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`
