/**
 * Budget planner that consumes VERIFIED effectiveness (Intervention Memory).
 *
 * Every option is valued in Protected Exposure Hours per night/day:
 *   value = people covered x hours x vulnerability x how much it helps x P(it actually works)
 * and picked greedily by value per rupee within the budget. The algorithm is ordinary on
 * purpose; what is new is that "P(it actually works)" comes from Pulse, so when heaters turn
 * out to be switched on 6 times in 10, money moves to sockets, bill permission and warm kits.
 */
import type { Belief, MemoryKey } from './memory'
import { hoursFor, VULNERABILITY, type ExposureNode, type Group } from './nodes'

export type OptionKind = 'heater' | 'socket_fix' | 'warm_kit' | 'move_spot' | 'shade_net' | 'water_pot' | 'cabin' | 'sapling'
export type Horizon = 'today' | 'season' | 'years'
export type EquityMode = 'efficiency' | 'balanced' | 'equity'

export interface OptionSpec {
  kind: OptionKind
  season: 'sardi' | 'garmi' | 'both'
  /** Intervention Memory entry whose learned rate this option uses */
  memory: MemoryKey | null
  unitCost: number
  /** people one unit covers */
  covers: number
  /** share of exposure one unit removes for the people it covers, when it works */
  relief: number
  horizon: Horizon
  /** relative spread of the relief estimate, shown as a range */
  spread: number
}

export const OPTIONS: Record<OptionKind, OptionSpec> = {
  heater: { kind: 'heater', season: 'sardi', memory: 'heater', unitCost: 1800, covers: 2, relief: 0.9, horizon: 'today', spread: 0.15 },
  socket_fix: { kind: 'socket_fix', season: 'sardi', memory: 'socket_fix', unitCost: 1500, covers: 2, relief: 0.9, horizon: 'today', spread: 0.15 },
  warm_kit: { kind: 'warm_kit', season: 'sardi', memory: 'warm_kit', unitCost: 1200, covers: 1, relief: 0.6, horizon: 'today', spread: 0.2 },
  move_spot: { kind: 'move_spot', season: 'garmi', memory: null, unitCost: 500, covers: 99, relief: 0.8, horizon: 'today', spread: 0.1 },
  shade_net: { kind: 'shade_net', season: 'garmi', memory: 'shade_net', unitCost: 3500, covers: 12, relief: 0.7, horizon: 'today', spread: 0.2 },
  water_pot: { kind: 'water_pot', season: 'garmi', memory: 'water_pot', unitCost: 900, covers: 40, relief: 0.25, horizon: 'today', spread: 0.3 },
  cabin: { kind: 'cabin', season: 'both', memory: 'cabin', unitCost: 45000, covers: 2, relief: 0.8, horizon: 'season', spread: 0.2 },
  sapling: { kind: 'sapling', season: 'garmi', memory: 'sapling', unitCost: 650, covers: 6, relief: 0.5, horizon: 'years', spread: 0.35 },
}

const WARMTH_GROUPS: Group[] = ['guard', 'homeless', 'labour', 'attendant', 'worker', 'vendor']
const SHADE_GROUPS: Group[] = ['guard', 'vendor', 'labour', 'worker', 'attendant', 'commuter']

export interface NodeContext {
  node: ExposureNode
  /** hazard weight 0..1 for this node tonight / today (e.g. Survival Burning Risk / 100) */
  hazard: number
  /**
   * winter: the heater at the gate, as far as Pulse knows. 'failed_fixable' = it is there but not
   * used for a reason a socket / bill permission fixes; 'failed_broken' = needs replacing.
   */
  heater: 'none' | 'unconfirmed' | 'working' | 'failed_fixable' | 'failed_broken'
  /** summer: shade-hours a zero-cost move into existing shadow would add per person (from the Shade Clock) */
  moveGainHours?: number
  /** summer: hours in direct sun during the shift */
  sunHours?: number
}

export interface Pick {
  nodeId: string
  kind: OptionKind
  units: number
  cost: number
  /** expected Protected Exposure Hours per night/day */
  peh: number
  pehLo: number
  pehHi: number
  people: number
}

export interface Plan {
  picks: Pick[]
  spent: number
  peh: number
  pehLo: number
  pehHi: number
  byKind: Partial<Record<OptionKind, { units: number; cost: number }>>
  /** saplings: benefit comes after years; listed, never bought from "today" money */
  longTerm: { nodeId: string; units: number }[]
}

const equityWeight = (mode: EquityMode, g: Group) => {
  if (mode === 'efficiency') return 1
  const vulnerable = g === 'homeless' || g === 'labour' || g === 'attendant'
  return vulnerable ? (mode === 'equity' ? 2 : 1.4) : 1
}

interface Candidate {
  nodeId: string
  kind: OptionKind
  group: Group
  remaining: number
  /** value per covered person per unit of relief */
  perPerson: number
  rate: number
}

export function planBudget(opts: {
  season: 'sardi' | 'garmi'
  budget: number
  contexts: NodeContext[]
  beliefs: Record<MemoryKey, Belief>
  mode?: EquityMode
}): Plan {
  const mode = opts.mode ?? 'balanced'
  const rate = (spec: OptionSpec) => (spec.memory ? opts.beliefs[spec.memory].planValue : 0.95)
  const heaterRate = opts.beliefs.heater.planValue
  const candidates: Candidate[] = []

  for (const ctx of opts.contexts) {
    const n = ctx.node
    const prof = opts.season === 'sardi' ? n.winter : n.summer
    for (const [g, count] of Object.entries(prof.people) as [Group, number][]) {
      if (!count) continue
      const hours = hoursFor(g, prof)
      const weight = VULNERABILITY[g] * equityWeight(mode, g) * (0.3 + 0.7 * ctx.hazard)
      const push = (kind: OptionKind, people: number, hrs: number, factor = 1) => {
        const spec = OPTIONS[kind]
        if (spec.season !== 'both' && spec.season !== opts.season) return
        candidates.push({ nodeId: n.id, kind, group: g, remaining: people, perPerson: hrs * weight * factor, rate: rate(spec) })
      }
      if (opts.season === 'sardi') {
        if (!WARMTH_GROUPS.includes(g)) continue
        // how much of a guard's night is still unprotected, given the heater's state
        const uncovered =
          g !== 'guard' || ctx.heater === 'none' || ctx.heater === 'failed_fixable' || ctx.heater === 'failed_broken'
            ? 1
            : ctx.heater === 'working'
              ? 0.1
              : 1 - heaterRate // only "distributed": trust it as much as Pulse says heaters get used
        if (g === 'guard' && (ctx.heater === 'none' || ctx.heater === 'failed_broken')) push('heater', count, hours)
        // a socket + bill permission helps only where a heater exists but is not running
        if (g === 'guard' && (ctx.heater === 'failed_fixable' || ctx.heater === 'unconfirmed')) push('socket_fix', count, hours, uncovered)
        push('warm_kit', count, hours, uncovered)
        if (g === 'guard') push('cabin', count, hours, 0.5) // half its value is the other season
      } else {
        if (!SHADE_GROUPS.includes(g)) continue
        const sun = ctx.sunHours ?? hours
        if (ctx.moveGainHours && ctx.moveGainHours > 0 && g !== 'commuter') push('move_spot', count, ctx.moveGainHours)
        push('shade_net', count, sun)
        if (!n.summer.water) push('water_pot', count, hours)
        if (g === 'guard') push('cabin', count, sun, 0.5)
      }
    }
  }

  const picks = new Map<string, Pick>()
  let spent = 0
  const unitGain = (c: Candidate) => {
    const spec = OPTIONS[c.kind]
    return c.perPerson * spec.relief * c.rate * Math.min(spec.covers, c.remaining)
  }
  for (;;) {
    let best: Candidate | null = null
    let bestRatio = 0
    for (const c of candidates) {
      const spec = OPTIONS[c.kind]
      if (c.remaining <= 0 || spent + spec.unitCost > opts.budget) continue
      const ratio = unitGain(c) / spec.unitCost
      if (ratio > bestRatio) {
        bestRatio = ratio
        best = c
      }
    }
    if (!best) break
    const spec = OPTIONS[best.kind]
    const gain = unitGain(best)
    const covered = Math.min(spec.covers, best.remaining)
    best.remaining -= spec.covers
    spent += spec.unitCost
    // one unit of shade/heat protection covers the whole node for its people, not per group:
    // retire sibling candidates of the same kind at this node by the same people count
    const key = `${best.nodeId}|${best.kind}`
    const p = picks.get(key) ?? { nodeId: best.nodeId, kind: best.kind, units: 0, cost: 0, peh: 0, pehLo: 0, pehHi: 0, people: 0 }
    p.units++
    p.cost += spec.unitCost
    p.peh += gain
    p.pehLo += gain * (1 - spec.spread)
    p.pehHi += gain * (1 + spec.spread)
    p.people += covered
    picks.set(key, p)
    // a fixed socket and a new heater are substitutes for the same guard
    if (best.kind === 'socket_fix' || best.kind === 'heater' || best.kind === 'cabin') {
      for (const c of candidates)
        if (c.nodeId === best.nodeId && c.group === best.group && c !== best && (c.kind === 'heater' || c.kind === 'socket_fix'))
          c.remaining -= covered
    }
  }

  const list = [...picks.values()].sort((a, b) => b.peh - a.peh)
  const byKind: Plan['byKind'] = {}
  for (const p of list) {
    const k = (byKind[p.kind] ??= { units: 0, cost: 0 })
    k.units += p.units
    k.cost += p.cost
  }
  const longTerm =
    opts.season === 'garmi'
      ? opts.contexts
          .filter((c) => (c.sunHours ?? 0) > 3)
          .map((c) => ({ nodeId: c.node.id, units: Math.min(6, Math.ceil((c.sunHours ?? 0) / 1.5)) }))
      : []
  return {
    picks: list, spent,
    peh: list.reduce((a, p) => a + p.peh, 0),
    pehLo: list.reduce((a, p) => a + p.pehLo, 0),
    pehHi: list.reduce((a, p) => a + p.pehHi, 0),
    byKind, longTerm,
  }
}

/** How the plan changed between two sets of beliefs (e.g. before and after Pulse). */
export function budgetShift(before: Plan, after: Plan) {
  const kinds = new Set([...Object.keys(before.byKind), ...Object.keys(after.byKind)]) as Set<OptionKind>
  return [...kinds]
    .map((k) => ({ kind: k, before: before.byKind[k]?.cost ?? 0, after: after.byKind[k]?.cost ?? 0 }))
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))
}
