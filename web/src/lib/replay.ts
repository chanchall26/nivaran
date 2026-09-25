/**
 * Season replay: one winter, night by night, to show the loop learning.
 *
 * Weather is REAL (winter 2025-26 in Gwalior). Events are SYNTHETIC and labelled:
 * 60 heaters are "distributed" on 1 Dec to guard posts; in truth about 6 in 10 get used.
 * Each night a few guards get a Pulse call; answers carry a reason. After MIN_SAMPLE answers
 * the plan switches from the "distributed = working" assumption to the learned rate and funds
 * socket + bill-permission fixes and warm kits; fixed heaters are re-checked a few nights later.
 */
import { belief, MIN_SAMPLE, PRIORS, type Belief } from './memory'
import type { NightRow } from './nodes'
import type { PulseReason } from './types'

export const SHIFT_HOURS = 12
export const GUARDS_PER_HEATER = 2

type Truth = 'working' | 'no_socket' | 'electricity_bill' | 'rwa_refused' | 'broken'

export interface ReplayEvent {
  kind: 'pulse' | 'switch' | 'fix' | 'recheck'
  heater: number
  ok?: boolean
  reason?: PulseReason
  /** true for the Raksha Vihar Gate 2 heater (Shyam) */
  shyam?: boolean
}

export interface ReplayNight {
  date: string
  minFeels: number
  vc: number
  heater: Belief
  socketFix: Belief
  /** which heater rate the planner is using tonight */
  planRate: number
  switched: boolean
  estimatedTonight: number
  verifiedTonight: number
  estimatedTotal: number
  verifiedTotal: number
  fixesDone: number
  kitsSent: number
  events: ReplayEvent[]
}

export interface Replay {
  nights: ReplayNight[]
  truthRate: number
  endRate: number
  table: { key: 'heater' | 'socket_fix' | 'warm_kit'; predicted: number; observed: number; n: number }[]
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const REASON_OF: Record<Exclude<Truth, 'working'>, PulseReason> = {
  no_socket: 'no_socket',
  electricity_bill: 'electricity_bill',
  rwa_refused: 'rwa_refused',
  broken: 'broken',
}

export function simulateWinter(nights: NightRow[], opts: { heaters?: number; seed?: number; callsPerNight?: number } = {}): Replay {
  const H = opts.heaters ?? 60
  const r = rng(opts.seed ?? 7)
  const calls = opts.callsPerNight ?? 3

  // hidden truth per heater: ~60% used; failures mostly access friction, not hardware
  const truth: Truth[] = Array.from({ length: H }, (_, i) => {
    if (i === 0) return 'no_socket' // Shyam's gate
    const x = r()
    if (x < 0.6) return 'working'
    const y = (x - 0.6) / 0.4
    return y < 0.4 ? 'no_socket' : y < 0.7 ? 'electricity_bill' : y < 0.9 ? 'rwa_refused' : 'broken'
  })
  const initialTruthRate = truth.filter((x) => x === 'working').length / H
  const verifiedWorking = new Set<number>()
  const known = new Map<number, Truth>() // what Pulse told us
  const fixedOn = new Map<number, number>() // heater -> night index the fix lands
  const kitTo = new Map<number, number>() // heater -> night the kit arrived
  let kitYes = 0
  let kitNo = 0
  let yes = 0
  let no = 0
  let fixYes = 0
  let fixNo = 0
  let switched = false
  let estTotal = 0
  let verTotal = 0
  const order = Array.from({ length: H }, (_, i) => i).sort(() => r() - 0.5)
  order.splice(order.indexOf(0), 1)
  order.splice(1, 0, 0) // Shyam gets called on the second night
  let cursor = 0
  const out: ReplayNight[] = []

  nights.forEach((night, t) => {
    const events: ReplayEvent[] = []
    // fixes land and change the truth
    for (const [h, day] of fixedOn) {
      if (day === t && truth[h] !== 'working' && truth[h] !== 'broken') {
        truth[h] = r() < 0.85 || h === 0 ? 'working' : truth[h]
        events.push({ kind: 'fix', heater: h, shyam: h === 0 })
      }
    }
    // first-round calls
    for (let k = 0; k < calls && cursor < order.length && t > 0; k++, cursor++) {
      const h = order[cursor]
      const ok = truth[h] === 'working'
      known.set(h, truth[h])
      if (ok) {
        yes++
        verifiedWorking.add(h)
      } else no++
      events.push({ kind: 'pulse', heater: h, ok, reason: ok ? 'none' : REASON_OF[truth[h] as Exclude<Truth, 'working'>], shyam: h === 0 })
    }
    // re-check fixed heaters 3 nights after the fix
    for (const [h, day] of fixedOn) {
      if (day + 3 === t) {
        const ok = truth[h] === 'working'
        if (ok) {
          fixYes++
          verifiedWorking.add(h)
        } else fixNo++
        events.push({ kind: 'recheck', heater: h, ok, reason: ok ? 'none' : REASON_OF[truth[h] as Exclude<Truth, 'working'>], shyam: h === 0 })
      }
    }
    // warm kits get their own check-in 3 nights after they arrive
    for (const [, day] of kitTo) {
      if (day + 3 === t) {
        if (r() < 0.85) kitYes++
        else kitNo++
      }
    }
    const heater = belief(PRIORS.heater, yes, no)
    const socketFix = belief(PRIORS.socket_fix, fixYes, fixNo)
    if (!switched && heater.sufficient) {
      switched = true
      events.push({ kind: 'switch', heater: -1 })
    }
    // once the plan uses learned values: fund a fix for every access failure we know of,
    // and a warm kit where the heater is broken (a fix will not help there)
    if (switched) {
      for (const [h, why] of known) {
        if ((why === 'no_socket' || why === 'electricity_bill' || why === 'rwa_refused') && !fixedOn.has(h)) fixedOn.set(h, t + 2)
        if (why === 'broken' && !kitTo.has(h)) kitTo.set(h, t)
      }
    }
    // Protected Exposure Hours tonight: the file view vs what Pulse has confirmed
    const cold = night.minFeels <= 16 ? 1 : 0
    const estimatedTonight = cold * H * GUARDS_PER_HEATER * SHIFT_HOURS * PRIORS.heater.a / (PRIORS.heater.a + PRIORS.heater.b)
    const verifiedTonight = cold * (verifiedWorking.size * GUARDS_PER_HEATER * SHIFT_HOURS + kitTo.size * GUARDS_PER_HEATER * SHIFT_HOURS * 0.6)
    estTotal += estimatedTonight
    verTotal += verifiedTonight
    out.push({
      date: night.date, minFeels: night.minFeels, vc: night.vc, heater, socketFix,
      planRate: heater.planValue, switched, estimatedTonight, verifiedTonight,
      estimatedTotal: estTotal, verifiedTotal: verTotal, fixesDone: [...fixedOn.values()].filter((d) => d <= t).length,
      kitsSent: kitTo.size, events,
    })
  })

  const last = out[out.length - 1]
  return {
    nights: out,
    /** share of heaters actually used before any fix: what the first-round Pulse estimates */
    truthRate: initialTruthRate,
    /** share used at the end of winter, after fixes */
    endRate: truth.filter((x) => x === 'working').length / H,
    table: [
      { key: 'heater', predicted: last.heater.priorMean, observed: last.heater.mean, n: last.heater.n },
      { key: 'socket_fix', predicted: last.socketFix.priorMean, observed: last.socketFix.mean, n: last.socketFix.n },
      { key: 'warm_kit', predicted: belief(PRIORS.warm_kit, 0, 0).priorMean, observed: belief(PRIORS.warm_kit, kitYes, kitNo).mean, n: kitYes + kitNo },
    ],
  }
}

export { MIN_SAMPLE }
