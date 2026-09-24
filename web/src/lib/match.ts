/**
 * Barahmasa Match: send limited stock where it helps the most people who need it most.
 *
 * Greedy allocation, one unit at a time. A unit goes to the place with the highest
 * marginal benefit = need(place) x people it would newly cover. After a unit lands,
 * that place's uncovered people drop, so the next unit naturally spreads out.
 * Greedy is optimal-enough here (benefits are diminishing per place) and, more
 * importantly, every choice comes with a one-line reason a donor can read.
 */
import { cellToLatLng, latLngToCell } from 'h3-js'
import { allSeasonNeed, CANOPY_TARGET, chhaya, alaav, type Norms } from './scoring'
import type { Cell, ItemType, Place, PlaceKind, Report, Season, WeatherSummary } from './types'

export interface ItemSpec {
  type: ItemType
  season: Season | 'both'
  /** people one unit protects */
  covers: number
  /** where it can go */
  kinds: PlaceKind[] | 'cell'
  unitCostInr: number
}

export const ITEMS: Record<ItemType, ItemSpec> = {
  heater: { type: 'heater', season: 'sardi', covers: 2,
    kinds: ['guard_post', 'shelter'], unitCostInr: 1800 },
  warm_kit: { type: 'warm_kit', season: 'sardi', covers: 1,
    kinds: ['homeless_spot', 'guard_post', 'labour_chowk', 'shelter'], unitCostInr: 1200 },
  cabin: { type: 'cabin', season: 'both', covers: 2,
    kinds: ['guard_post'], unitCostInr: 45000 },
  shade_net: { type: 'shade_net', season: 'garmi', covers: 12,
    kinds: ['rehri_zone', 'labour_chowk', 'transit', 'worksite'], unitCostInr: 3500 },
  water_pot: { type: 'water_pot', season: 'garmi', covers: 40,
    kinds: ['rehri_zone', 'transit', 'labour_chowk', 'worksite'], unitCostInr: 900 },
  sapling: { type: 'sapling', season: 'garmi', covers: 6,
    kinds: 'cell', unitCostInr: 650 },
}

export interface Allocation {
  item: ItemType
  qty: number
  target: { kind: 'place'; place: Place } | { kind: 'cell'; cell: Cell }
  h3: string
  lat: number
  lon: number
  need: number
  people: number
  /** open reports in the cell at planning time */
  reports: number
}

interface Candidate {
  key: string
  target: Allocation['target']
  cell: Cell
  need: number
  remaining: number
  reports: number
}

/** must match pipeline/build_grid.py */
export const H3_RES = 9

const reportBoost = (n: number) => 0.15 * Math.min(1, n / 3)

export function allocate(opts: {
  item: ItemType
  units: number
  cells: Cell[]
  places: Place[]
  reports: Report[]
  norms: Norms
  weather: WeatherSummary
  typicalWeather: WeatherSummary
  /** units already delivered per place/cell key, so re-running a plan doesn't double up */
  alreadyServed?: Map<string, number>
}): Allocation[] {
  const spec = ITEMS[opts.item]
  const byH3 = new Map(opts.cells.map((c) => [c.h3, c]))
  const reportsByH3 = new Map<string, number>()
  for (const r of opts.reports) {
    if (r.status !== 'resolved') reportsByH3.set(r.h3, (reportsByH3.get(r.h3) ?? 0) + 1)
  }

  const needOf = (c: Cell) => {
    if (spec.season === 'both') return allSeasonNeed(c, opts.norms, opts.typicalWeather)
    return spec.season === 'garmi' ? chhaya(c, opts.norms, opts.weather).need : alaav(c, opts.norms, opts.weather).need
  }

  const candidates: Candidate[] = []
  if (spec.kinds === 'cell') {
    for (const c of opts.cells) {
      // plantable street cells: some road frontage, some people, real canopy gap
      if (c.roadKm < 0.05 || c.canopy == null || c.canopy >= CANOPY_TARGET) continue
      const gapTrees = Math.ceil((CANOPY_TARGET - c.canopy) * 40) // ~40 street trees close a 100% gap in 0.1 km2
      const served = opts.alreadyServed?.get(c.h3) ?? 0
      const people = Math.max(0, gapTrees - served) * spec.covers
      if (!people) continue
      candidates.push({
        key: c.h3, target: { kind: 'cell', cell: c }, cell: c, need: needOf(c), remaining: people,
        reports: reportsByH3.get(c.h3) ?? 0,
      })
    }
  } else {
    for (const p of opts.places) {
      if (!spec.kinds.includes(p.kind)) continue
      const h = latLngToCell(p.lat, p.lon, H3_RES)
      const c = byH3.get(h)
      if (!c) continue
      const people = p.kind === 'shelter' ? (p.capacity ?? 40) : (p.staff ?? 1)
      const served = (opts.alreadyServed?.get(p.id) ?? 0) * spec.covers
      const remaining = Math.max(0, people - served)
      if (!remaining) continue
      candidates.push({
        key: p.id, target: { kind: 'place', place: p }, cell: c, need: needOf(c), remaining,
        reports: reportsByH3.get(h) ?? 0,
      })
    }
  }

  const given = new Map<string, number>()
  for (let u = 0; u < opts.units; u++) {
    let best: Candidate | null = null
    let bestGain = 0
    for (const cand of candidates) {
      if (cand.remaining <= 0) continue
      const gain = (cand.need + reportBoost(cand.reports)) * Math.min(spec.covers, cand.remaining)
      if (gain > bestGain) {
        bestGain = gain
        best = cand
      }
    }
    if (!best) break
    best.remaining -= spec.covers
    given.set(best.key, (given.get(best.key) ?? 0) + 1)
  }

  const out: Allocation[] = []
  for (const cand of candidates) {
    const qty = given.get(cand.key)
    if (!qty) continue
    const t = cand.target
    const [lat, lon] = t.kind === 'place' ? [t.place.lat, t.place.lon] : cellToLatLng(t.cell.h3)
    out.push({
      item: spec.type, qty, target: t, h3: cand.cell.h3, lat, lon,
      need: cand.need,
      people: Math.min(qty * spec.covers, t.kind === 'place' ? (t.place.staff ?? t.place.capacity ?? qty * spec.covers) : qty * spec.covers),
      reports: cand.reports,
    })
  }
  return out.sort((a, b) => b.need - a.need)
}

export function planCost(allocs: Allocation[]) {
  return allocs.reduce((s, a) => s + a.qty * ITEMS[a.item].unitCostInr, 0)
}

/**
 * What happens today, for comparison: heaters go to whoever asks first (organised
 * colonies near the centre), saplings go wherever free land is (low-density edges).
 * Same units, same item; only the targeting differs.
 */
export function firstComeBaseline(opts: Parameters<typeof allocate>[0]): Allocation[] {
  const spec = ITEMS[opts.item]
  const centre = { lat: 26.21, lon: 78.199 } // City Centre, where RWAs are best organised
  if (spec.kinds === 'cell') {
    const free = [...opts.cells]
      .filter((c) => c.canopy != null && c.canopy < CANOPY_TARGET)
      .sort((a, b) => a.pop - b.pop) // emptiest land first
    const n = Math.min(free.length, Math.ceil(opts.units / 10))
    return free.slice(0, n).map((c, i) => {
      const qty = Math.floor(opts.units / n) + (i < opts.units % n ? 1 : 0)
      const need = chhaya(c, opts.norms, opts.weather).need
      return {
        item: spec.type, qty, target: { kind: 'cell', cell: c }, h3: c.h3, lat: c.lat, lon: c.lon,
        need, people: Math.min(qty * spec.covers, c.exposed), reports: 0,
      } as Allocation
    })
  }
  const d2 = (p: Place) => (p.lat - centre.lat) ** 2 + (p.lon - centre.lon) ** 2
  const byH3 = new Map(opts.cells.map((c) => [c.h3, c]))
  const queue = opts.places.filter((p) => (spec.kinds as PlaceKind[]).includes(p.kind)).sort((a, b) => d2(a) - d2(b))
  const out: Allocation[] = []
  let left = opts.units
  for (const p of queue) {
    if (left <= 0) break
    const c = byH3.get(latLngToCell(p.lat, p.lon, H3_RES))
    if (!c) continue
    const people = p.kind === 'shelter' ? (p.capacity ?? 40) : (p.staff ?? 1)
    const qty = Math.min(left, Math.ceil(people / spec.covers))
    left -= qty
    const need =
      spec.season === 'both'
        ? allSeasonNeed(c, opts.norms, opts.typicalWeather)
        : spec.season === 'garmi'
          ? chhaya(c, opts.norms, opts.weather).need
          : alaav(c, opts.norms, opts.weather).need
    out.push({
      item: spec.type, qty, target: { kind: 'place', place: p }, h3: c.h3, lat: p.lat, lon: p.lon,
      need, people: Math.min(people, qty * spec.covers), reports: 0,
    })
  }
  return out
}

/** Need-weighted people reached: the one number that says whether help went to the right place. */
export const needWeightedReach = (plan: Allocation[]) => plan.reduce((s, a) => s + a.need * a.people, 0)
