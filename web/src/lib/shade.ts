/**
 * Shade Clock: where is there shade, at what time, at an Exposure Node.
 *
 * Sun position from suncalc; each building (Google Open Buildings footprint + 2.5D height)
 * casts its footprint pushed away from the sun by h / tan(sun altitude), and the shadow is
 * the convex hull of the footprint and that pushed copy (exact for convex footprints, a fair
 * approximation for the rest). Tree crowns (ESA WorldCover 10 m pixels) cast a disc.
 * Idea from shade-simulation work such as Slim Shady; the code here is our own.
 */
import * as SunCalc from 'suncalc'
import type { ExposureNode } from './nodes'

type XY = [number, number]

const TREE_RADIUS = 4 // m
const TREE_CROWN_H = 6 // m, middle of the crown
const SPOT_RADIUS = 2.5 // m: where a guard's chair or a vendor's cart stands

/** Local metres around the node (equirectangular; errors are cm-level at 120 m). */
export function projector(lat0: number, lon0: number) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110540
  return {
    toXY: ([lon, lat]: [number, number]): XY => [(lon - lon0) * kx, (lat - lat0) * ky],
    toLonLat: ([x, y]: XY): [number, number] => [lon0 + x / kx, lat0 + y / ky],
  }
}

export function convexHull(points: XY[]): XY[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: XY[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: XY[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

export function pointInPolygon([x, y]: XY, poly: XY[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export interface Sun {
  altitude: number // degrees
  /** unit vector pointing FROM the ground TOWARDS the sun, (east, north) */
  dir: XY
}

export function sunAt(date: Date, lat: number, lon: number): Sun {
  // suncalc 2.x: degrees; azimuth from north, clockwise (90 = east)
  const p = SunCalc.getPosition(date, lat, lon)
  const az = (p.azimuth * Math.PI) / 180
  return { altitude: p.altitude, dir: [Math.sin(az), Math.cos(az)] }
}

/** Prepared geometry for one node: buildings and trees in local metres. */
export interface Scene {
  node: ExposureNode
  proj: ReturnType<typeof projector>
  buildings: { poly: XY[]; h: number }[]
  trees: XY[]
  spot: XY
}

export function makeScene(node: ExposureNode): Scene {
  const proj = projector(node.lat, node.lon)
  return {
    node, proj,
    buildings: node.buildings.map((b) => ({ poly: b.c.map((c) => proj.toXY(c)), h: b.h })),
    trees: node.trees.map((t) => proj.toXY(t)),
    spot: [0, 0],
  }
}

export interface Shadows {
  sun: Sun
  buildings: XY[][]
  trees: { c: XY; r: number }[]
}

export function shadowsAt(scene: Scene, date: Date): Shadows {
  const sun = sunAt(date, scene.node.lat, scene.node.lon)
  if (sun.altitude <= 1) return { sun, buildings: [], trees: [] }
  const k = 1 / Math.tan((sun.altitude * Math.PI) / 180)
  const away: XY = [-sun.dir[0], -sun.dir[1]]
  const buildings = scene.buildings.map(({ poly, h }) => {
    const len = Math.min(h * k, 150) // low sun: cap very long shadows
    const moved = poly.map(([x, y]) => [x + away[0] * len, y + away[1] * len] as XY)
    return convexHull([...poly, ...moved])
  })
  const tl = Math.min(TREE_CROWN_H * k, 80)
  const trees = scene.trees.map(([x, y]) => ({ c: [x + away[0] * tl, y + away[1] * tl] as XY, r: TREE_RADIUS }))
  return { sun, buildings, trees }
}

const SPOT_SAMPLES: XY[] = [[0, 0], ...Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3
  return [Math.cos(a) * SPOT_RADIUS, Math.sin(a) * SPOT_RADIUS] as XY
})]

function shadedPoint(p: XY, sh: Shadows) {
  if (sh.sun.altitude <= 1) return true // no sun
  for (const t of sh.trees) if ((p[0] - t.c[0]) ** 2 + (p[1] - t.c[1]) ** 2 <= t.r * t.r) return true
  for (const b of sh.buildings) if (pointInPolygon(p, b)) return true
  return false
}

/** Share of the spot (0..1) in shade. */
export function shadeFraction(at: XY, sh: Shadows) {
  let n = 0
  for (const [dx, dy] of SPOT_SAMPLES) if (shadedPoint([at[0] + dx, at[1] + dy], sh)) n++
  return n / SPOT_SAMPLES.length
}

/** Local IST date at hh:mm on the given ISO day. */
export const istTime = (day: string, minutes: number) =>
  new Date(`${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+05:30`)

export interface ShadeSlot {
  minutes: number
  shade: number
  sunUp: boolean
}

export function shadeProfile(scene: Scene, day: string, at: XY = scene.spot, from = 6 * 60, to = 19 * 60, step = 30): ShadeSlot[] {
  const out: ShadeSlot[] = []
  for (let m = from; m <= to; m += step) {
    const sh = shadowsAt(scene, istTime(day, m))
    out.push({ minutes: m, shade: shadeFraction(at, sh), sunUp: sh.sun.altitude > 1 })
  }
  return out
}

/** Longest stretch during the shift when the spot is mostly in the sun. */
export function sunWindow(profile: ShadeSlot[], shift: [number, number], step = profile.length > 1 ? profile[1].minutes - profile[0].minutes : 30) {
  let best: [number, number] | null = null
  let start: number | null = null
  const inShift = profile.filter((s) => s.minutes >= shift[0] * 60 && s.minutes < shift[1] * 60)
  for (const s of [...inShift, { minutes: Infinity, shade: 1, sunUp: false }]) {
    const sunny = s.sunUp && s.shade < 0.5
    if (sunny && start == null) start = s.minutes
    if (!sunny && start != null) {
      const end = s.minutes === Infinity ? inShift[inShift.length - 1].minutes + step : s.minutes
      if (!best || end - start > best[1] - best[0]) best = [start, end]
      start = null
    }
  }
  return best
}

/** Hours during the shift the spot sits in direct sun (for the planner). */
export function sunHoursInShift(profile: ShadeSlot[], shift: [number, number], step = 30) {
  return profile.filter((s) => s.minutes >= shift[0] * 60 && s.minutes < shift[1] * 60 && s.sunUp)
    .reduce((a, s) => a + (1 - s.shade) * (step / 60), 0)
}

/**
 * The zero-cost option: is there a nearby spot that stays shaded through the hot hours?
 * Searches a 3 m grid within `radius` m, outside buildings, for the most shade during
 * the hottest part of the shift (12:00-16:00 by default), preferring shorter moves.
 */
export function bestMove(scene: Scene, day: string, radius = 40, window: [number, number] = [12, 16]) {
  const slots: Shadows[] = []
  for (let m = window[0] * 60; m < window[1] * 60; m += 30) slots.push(shadowsAt(scene, istTime(day, m)))
  const score = (p: XY) => slots.reduce((a, sh) => a + shadeFraction(p, sh), 0) * 0.5 // hours
  const here = score(scene.spot)
  let best = { at: scene.spot, hours: here, dist: 0 }
  for (let x = -radius; x <= radius; x += 3) {
    for (let y = -radius; y <= radius; y += 3) {
      const d = Math.hypot(x, y)
      if (d > radius || d < 3) continue
      if (scene.buildings.some((b) => pointInPolygon([x, y], b.poly))) continue
      const h = score([x, y])
      // a longer walk must buy clearly more shade
      if (h > best.hours + 0.25 || (Math.abs(h - best.hours) <= 0.25 && h > here && d < best.dist)) best = { at: [x, y], hours: h, dist: d }
    }
  }
  return { ...best, here, gain: best.hours - here, lonLat: scene.proj.toLonLat(best.at) }
}

export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
