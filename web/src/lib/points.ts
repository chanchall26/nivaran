/**
 * Map points: places where people work outside. Curated for the pilot cities (anchored to real
 * OpenStreetMap features), fetched live from Overpass within 2 km for any other place.
 * People counts are always estimates.
 */
import { km, type Pilot } from './place'
import { burningRisk, hourLevel, inShift, isNightHour, nightStats, type Burning, type Day, type FireRisk, type Heater, type Level, type Mode, type Shift } from './risk'

export type PointType =
  | 'atm' | 'bank' | 'hospital' | 'bus' | 'rail' | 'market' | 'fuel' | 'signal' | 'construction' | 'shelter' | 'labour' | 'gate' | 'water'
export type Group = 'guard' | 'attendant' | 'vendor' | 'porter' | 'labour' | 'traffic' | 'worker' | 'homeless' | 'delivery' | 'driver'
export type Offer = 'shade' | 'water' | 'shelter' | 'heater'

export interface Crew {
  group: Group
  count: number
  shift: Shift
}
export interface Point {
  id: string
  name: string
  nameHi: string
  lat: number
  lon: number
  type: PointType
  ward: string
  wardHi: string
  people: Crew[]
  offers?: Offer[]
  heater?: Heater
  osm?: string
  /** curated points not tied to one OSM feature */
  anchor?: 'manual'
  /** planting: tight lane or open road/square; traffic next to the spot; shade there now (estimates) */
  street?: 'narrow' | 'open'
  traffic?: 'busy' | 'some' | 'quiet'
  shadeNow?: 'none' | 'some' | 'good'
  /** true for points built from OSM defaults on the fly (not curated) */
  auto?: boolean
}

async function getJson<T>(url: string, init?: RequestInit, ms = 12000): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(t)
  }
}

export async function loadCurated(pilot: Pilot): Promise<Point[]> {
  const r = await getJson<{ points: Point[] }>(`/data/points/${pilot}.json`)
  return r.points
}

// ---------- any other place: OpenStreetMap ----------

interface OsmEl {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

const DEFAULT_PEOPLE: Record<PointType, Crew[]> = {
  atm: [{ group: 'guard', count: 1, shift: 'night' }],
  bank: [{ group: 'guard', count: 1, shift: 'night' }],
  hospital: [{ group: 'attendant', count: 20, shift: 'night' }, { group: 'guard', count: 2, shift: 'night' }],
  bus: [{ group: 'vendor', count: 12, shift: 'day' }, { group: 'porter', count: 6, shift: 'night' }],
  rail: [{ group: 'vendor', count: 15, shift: 'day' }, { group: 'porter', count: 10, shift: 'night' }],
  market: [{ group: 'vendor', count: 25, shift: 'day' }],
  signal: [{ group: 'traffic', count: 2, shift: 'day' }],
  construction: [{ group: 'labour', count: 30, shift: 'day' }, { group: 'guard', count: 1, shift: 'night' }],
  fuel: [{ group: 'worker', count: 3, shift: 'day' }, { group: 'worker', count: 2, shift: 'night' }],
  shelter: [{ group: 'homeless', count: 20, shift: 'night' }],
  labour: [{ group: 'labour', count: 60, shift: 'day' }],
  gate: [{ group: 'guard', count: 1, shift: 'night' }],
  water: [],
}

function typeOf(t: Record<string, string>): PointType | null {
  if (t.amenity === 'atm') return 'atm'
  if (t.amenity === 'bank') return 'bank'
  if (t.amenity === 'hospital') return 'hospital'
  if (t.amenity === 'bus_station') return 'bus'
  if (t.railway === 'station') return 'rail'
  if (t.amenity === 'marketplace') return 'market'
  if (t.amenity === 'fuel') return 'fuel'
  if (t.highway === 'traffic_signals') return 'signal'
  if (t.landuse === 'construction' || t.building === 'construction') return 'construction'
  return null
}
/** Planting defaults for OSM points we have not reviewed (estimates). */
const STREET: Record<PointType, Pick<Point, 'street' | 'traffic' | 'shadeNow'>> = {
  atm: { street: 'narrow', traffic: 'some', shadeNow: 'some' },
  bank: { street: 'narrow', traffic: 'some', shadeNow: 'some' },
  hospital: { street: 'open', traffic: 'some', shadeNow: 'some' },
  bus: { street: 'open', traffic: 'busy', shadeNow: 'none' },
  rail: { street: 'open', traffic: 'busy', shadeNow: 'some' },
  market: { street: 'narrow', traffic: 'busy', shadeNow: 'none' },
  fuel: { street: 'open', traffic: 'busy', shadeNow: 'none' },
  signal: { street: 'open', traffic: 'busy', shadeNow: 'none' },
  construction: { street: 'open', traffic: 'some', shadeNow: 'none' },
  shelter: { street: 'open', traffic: 'quiet', shadeNow: 'some' },
  labour: { street: 'open', traffic: 'busy', shadeNow: 'none' },
  gate: { street: 'narrow', traffic: 'quiet', shadeNow: 'some' },
  water: { street: 'open', traffic: 'some', shadeNow: 'some' },
}

const PER_TYPE: Partial<Record<PointType, number>> = { atm: 3, bank: 2, hospital: 2, bus: 2, rail: 1, market: 3, fuel: 2, signal: 3, construction: 2 }

/** Points around any Indian place from OpenStreetMap, with default people counts ("Estimated"). */
export async function loadOsm(lat: number, lon: number): Promise<Point[]> {
  const r = 2000
  const q = `[out:json][timeout:20];(
    node(around:${r},${lat},${lon})[amenity~"^(atm|bank|hospital|bus_station|marketplace|fuel)$"];
    way(around:${r},${lat},${lon})[amenity~"^(hospital|bus_station|marketplace|fuel)$"];
    node(around:${r},${lat},${lon})[railway=station];
    node(around:${r},${lat},${lon})[highway=traffic_signals];
    way(around:${r},${lat},${lon})[landuse=construction];
  );out center 400;`
  const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
  let els: OsmEl[] | null = null
  for (const m of mirrors) {
    try {
      els = (await getJson<{ elements: OsmEl[] }>(m, { method: 'POST', body: 'data=' + encodeURIComponent(q) })).elements
      break
    } catch {
      /* try the next mirror */
    }
  }
  if (!els) throw new Error('overpass')
  const picked: Point[] = []
  const count: Partial<Record<PointType, number>> = {}
  const rows = els
    .map((e) => ({ e, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, type: typeOf(e.tags ?? {}) }))
    .filter((x): x is { e: OsmEl; lat: number; lon: number; type: PointType } => x.type != null && x.lat != null && x.lon != null)
    // named places first, then nearest
    .sort((a, b) => Number(!!b.e.tags?.name) - Number(!!a.e.tags?.name) || km(lat, lon, a.lat, a.lon) - km(lat, lon, b.lat, b.lon))
  for (const x of rows) {
    if ((count[x.type] ?? 0) >= (PER_TYPE[x.type] ?? 2)) continue
    if (picked.some((p) => km(p.lat, p.lon, x.lat, x.lon) < 0.08)) continue
    count[x.type] = (count[x.type] ?? 0) + 1
    const t = x.e.tags ?? {}
    const name = t.name || t['name:en'] || ''
    picked.push({
      id: `${x.e.type}-${x.e.id}`, name, nameHi: t['name:hi'] || name, lat: x.lat, lon: x.lon, type: x.type,
      ward: t['addr:suburb'] || t['addr:city'] || '', wardHi: '', people: DEFAULT_PEOPLE[x.type],
      heater: DEFAULT_PEOPLE[x.type].some((c) => c.shift === 'night' && c.group === 'guard') ? 'unconfirmed' : undefined,
      osm: `${x.e.type}/${x.e.id}`, auto: true, ...STREET[x.type],
    })
    if (picked.length >= 14) break
  }
  return picked
}

const OSM_KEY = 'bm:osm:'
/** OSM points cached for a day per place. */
export async function loadOsmCached(lat: number, lon: number): Promise<{ points: Point[]; savedAt: number; stale: boolean }> {
  const key = `${OSM_KEY}${lat.toFixed(3)},${lon.toFixed(3)}`
  let hit: { savedAt: number; points: Point[] } | null = null
  try {
    hit = JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    /* ignore */
  }
  if (hit && Date.now() - hit.savedAt < 86400_000) return { ...hit, stale: false }
  try {
    const points = await loadOsm(lat, lon)
    const e = { savedAt: Date.now(), points }
    try {
      localStorage.setItem(key, JSON.stringify(e))
    } catch {
      /* not cached */
    }
    return { ...e, stale: false }
  } catch (err) {
    if (hit) return { ...hit, stale: true }
    throw err
  }
}

// ---------- danger at a point ----------

export const peopleCount = (p: Point) => p.people.reduce((a, c) => a + c.count, 0)
export const hasNight = (p: Point) => p.people.some((c) => c.shift === 'night')

/** How long each crew is outside: day and night shifts are 12 hours each. */
export const SHIFT_HOURS = 12
/** Night person-hours, with people who have nowhere to go counting more. */
export function nightPersonHours(p: Point) {
  return p.people.filter((c) => c.shift === 'night').reduce((a, c) => a + c.count * SHIFT_HOURS * (c.group === 'homeless' ? 1.5 : 1), 0)
}

export interface PointRisk {
  level: Level
  /** hour-weighted score for sorting: night hours count double for night crews */
  score: number
  /** fire risk tonight, when someone is out at night and the night is cold enough to matter */
  fire: FireRisk | null
  burning: Burning | null
}

export function pointRisk(
  p: Point, day: Day, next: Day | undefined, _modes: Mode[],
  o: { heater?: Heater; heaterRate?: number; reports?: number } = {},
): PointRisk {
  let level: Level = 0
  let score = 0
  for (const c of p.people) {
    for (const h of day.hours) {
      if (!inShift(h.hour, c.shift)) continue
      const l = hourLevel(h)
      if (l > level) level = l
      score += l * (c.shift === 'night' && isNightHour(h.hour) ? 2 : 1) * Math.sqrt(c.count)
    }
  }
  let burning: Burning | null = null
  if (hasNight(p)) {
    burning = burningRisk(nightStats(day, next), {
      personHours: nightPersonHours(p), heater: o.heater ?? p.heater, heaterRate: o.heaterRate ?? 0.9,
      shelter: p.offers?.includes('shelter'), reports: o.reports,
    })
    if (burning.parts.cold === 0) burning = null
  }
  return { level, score, fire: burning?.level ?? null, burning }
}

// ---------- protection and Resilience Debt ----------

export type Guard = 'shade' | 'water' | 'heater' | 'shelter' | 'warm_kit' | 'masks'
export interface Protection {
  /** what matters for today's hazards, and whether this point has it */
  items: { kind: Guard; has: number }[]
  /** 0..1 */
  share: number
}

/**
 * What protection a point has for today's hazards: offers on the ground, heaters as far as checks
 * know (a handed-out heater counts as the share that really run), and help confirmed working.
 */
export function protectionOf(p: Point, hazards: { heat: boolean; cold: boolean; air: boolean }, o: { heater?: Heater; heaterRate: number; confirmed: Set<string> }): Protection {
  const items: Protection['items'] = []
  const has = (k: Guard) => (p.offers?.includes(k as Offer) || o.confirmed.has(k) ? 1 : 0)
  if (hazards.heat && p.people.some((c) => c.shift === 'day')) items.push({ kind: 'shade', has: has('shade') }, { kind: 'water', has: has('water') })
  if (hazards.cold && hasNight(p)) {
    const h = o.heater ?? p.heater
    if (p.people.some((c) => c.shift === 'night' && c.group !== 'homeless'))
      items.push({ kind: 'heater', has: h === 'working' || o.confirmed.has('heater') ? 1 : h === 'unconfirmed' ? o.heaterRate : 0 }, { kind: 'warm_kit', has: has('warm_kit') })
    if (p.people.some((c) => c.group === 'homeless')) items.push({ kind: 'shelter', has: has('shelter') })
  }
  if (hazards.air) items.push({ kind: 'masks', has: has('masks') })
  const share = items.length ? items.reduce((a, x) => a + x.has, 0) / items.length : 1
  return { items, share }
}

/**
 * Resilience Debt: danger that is not yet covered. 0-100 across today's points:
 *   debt = (this point's danger / the highest danger today) x (1 - 0.8 x protection)
 * High danger and little protection come first.
 */
export function resilienceDebt(riskScore: number, maxScore: number, protection: number) {
  if (maxScore <= 0 || riskScore <= 0) return 0
  return Math.round(100 * (riskScore / maxScore) * (1 - 0.8 * protection))
}

/** The one thing this point needs most today. */
export type TopNeed = 'heater_check' | 'shelter_ride' | 'warm_kit' | 'shade' | 'water_ors' | 'sheet' | 'masks' | 'none'
export function topNeed(p: Point, modes: Mode[], heater?: Heater): TopNeed {
  const m = modes[0]
  const h = heater ?? p.heater
  const night = hasNight(p)
  if (m === 'cold') {
    if (night && (h === 'unconfirmed' || h === 'failed')) return 'heater_check'
    if (p.people.some((c) => c.group === 'homeless')) return 'shelter_ride'
    return 'warm_kit'
  }
  if (m === 'heat') return p.people.some((c) => c.shift === 'day') ? 'shade' : 'water_ors'
  if (m === 'humid') return 'water_ors'
  if (m === 'rain') return 'sheet'
  if (m === 'smoky') return 'masks'
  return 'none'
}
