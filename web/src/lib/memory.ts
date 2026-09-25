/**
 * Intervention Memory: how often does each kind of help ACTUALLY work here?
 *
 * Beta-Binomial learning. Each intervention starts from a prior (what the plan assumed:
 * "distributed" heaters are taken to work 9 times in 10) and every Pulse answer updates it:
 *   posterior = Beta(a0 + yes, b0 + no)
 * We always show a 90% range, and the plan only switches to the learned value once at
 * least MIN_SAMPLE answers are in (before that the range is too wide to act on).
 */
import type { Delivery, ItemType, PulseCheck } from './types'

export const MIN_SAMPLE = 15

export interface Prior {
  a: number
  b: number
}

/** What each intervention is assumed to deliver before anyone checks (prior strength 5). */
export const PRIORS: Record<ItemType | 'socket_fix', Prior> = {
  heater: { a: 4.5, b: 0.5 }, // "distributed = working": 0.90
  warm_kit: { a: 4.5, b: 0.5 },
  cabin: { a: 4.5, b: 0.5 },
  shade_net: { a: 4, b: 1 },
  water_pot: { a: 4, b: 1 },
  sapling: { a: 4, b: 1 }, // 80% 1-year survival target
  socket_fix: { a: 4, b: 1 },
}

// ---- Beta distribution helpers ---------------------------------------------------------

function lnGamma(z: number): number {
  // Lanczos approximation (g = 7), accurate to ~1e-13 for z > 0
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

/** Continued fraction for the incomplete beta function (Lentz's method). */
function betacf(a: number, b: number, x: number): number {
  const EPS = 1e-12
  const TINY = 1e-300
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b) = CDF of Beta(a, b) at x. */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbt = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  const bt = Math.exp(lbt)
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

export function betaQuantile(p: number, a: number, b: number): number {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (betaCdf(mid, a, b) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// ---- learning --------------------------------------------------------------------------

export interface Belief {
  prior: Prior
  priorMean: number
  yes: number
  no: number
  n: number
  a: number
  b: number
  mean: number
  lo: number // 5th percentile
  hi: number // 95th percentile
  /** enough answers to let the plan act on the learned value */
  sufficient: boolean
  /** the value the planner should use right now */
  planValue: number
}

export function belief(prior: Prior, yes: number, no: number): Belief {
  const a = prior.a + yes
  const b = prior.b + no
  const mean = a / (a + b)
  const priorMean = prior.a / (prior.a + prior.b)
  const n = yes + no
  const sufficient = n >= MIN_SAMPLE
  return {
    prior, priorMean, yes, no, n, a, b, mean,
    lo: betaQuantile(0.05, a, b),
    hi: betaQuantile(0.95, a, b),
    sufficient,
    planValue: sufficient ? mean : priorMean,
  }
}

export type MemoryKey = keyof typeof PRIORS

/** Beliefs for every intervention from the Pulse answers recorded so far. */
export function learnFromPulses(deliveries: Delivery[], pulses: PulseCheck[]): Record<MemoryKey, Belief> {
  const itemOf = new Map(deliveries.map((d) => [d.id, d.item]))
  const tally = Object.fromEntries((Object.keys(PRIORS) as MemoryKey[]).map((k) => [k, { yes: 0, no: 0 }])) as Record<
    MemoryKey,
    { yes: number; no: number }
  >
  // latest answer per delivery counts once: one household, one vote
  const latest = new Map<string, PulseCheck>()
  for (const p of pulses) {
    const prev = latest.get(p.deliveryId)
    if (!prev || prev.createdAt < p.createdAt) latest.set(p.deliveryId, p)
  }
  for (const p of latest.values()) {
    const item = itemOf.get(p.deliveryId)
    if (!item) continue
    if (p.ok) tally[item].yes++
    else tally[item].no++
  }
  return Object.fromEntries(
    (Object.keys(PRIORS) as MemoryKey[]).map((k) => [k, belief(PRIORS[k], tally[k].yes, tally[k].no)]),
  ) as Record<MemoryKey, Belief>
}
