import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { budgetShift, planBudget, type NodeContext } from './budget'
import { belief, betaQuantile, MIN_SAMPLE, PRIORS, type Belief, type MemoryKey } from './memory'
import { burningRisk, exposureDose, nightAsWeather, type NightRow, type NodesFile } from './nodes'
import { simulateWinter } from './replay'
import { heatIndex, windChill } from './thermal'

const data = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../public/data/gwalior', f), 'utf-8'))
const { nodes }: NodesFile = data('nodes.json')
const nights: NightRow[] = data('winter_nights.json').nights
const shyam = nodes.find((n) => n.id === 'shyam-gate')!
const coldest = nights.reduce((a, b) => (b.minFeels < a.minFeels ? b : a))
const warmNight = { nightMinFeels: 18, nightMinTemp: 18, nightMeanWind: 3, ventilation: 3000 }

describe('thermal indices match pythermalcomfort 4.6.0', () => {
  it('wind chill (Environment Canada formula)', () => {
    // reference: pythermalcomfort.models.wind_chill_temperature(tdb, v[km/h])
    for (const [t, v, ref] of [[-10, 20, -17.9], [5, 10, 2.7], [8, 15, 5.4], [0, 30, -6.5], [6, 7, 4.6]])
      expect(windChill(t, v)).toBeCloseTo(ref, 1)
    expect(windChill(15, 20)).toBe(15) // outside the formula's range: no chill
  })

  it('heat index (NWS Rothfusz)', () => {
    // reference: pythermalcomfort.models.heat_index_rothfusz(tdb, rh)
    for (const [t, rh, ref] of [[32.2, 70, 41.0], [40, 30, 43.1], [35, 50, 40.7], [44, 20, 45.5]])
      expect(Math.abs(heatIndex(t, rh) - ref)).toBeLessThan(0.3)
  })
})

describe('Intervention Memory (Beta-Binomial)', () => {
  it('matches scipy quantiles', () => {
    // scipy.stats.beta.ppf
    expect(betaQuantile(0.05, 28.5, 16.5)).toBeCloseTo(0.513, 3)
    expect(betaQuantile(0.95, 28.5, 16.5)).toBeCloseTo(0.7469, 3)
    expect(betaQuantile(0.05, 9.5, 6.5)).toBeCloseTo(0.3906, 3)
  })

  it("reproduces the document's worked example: 24 of 40 said yes -> ~0.63 (0.51-0.75)", () => {
    const b = belief(PRIORS.heater, 24, 16)
    expect(b.priorMean).toBeCloseTo(0.9, 5)
    expect(b.mean).toBeCloseTo(0.633, 2)
    expect(b.lo).toBeCloseTo(0.51, 2)
    expect(b.hi).toBeCloseTo(0.75, 2)
    expect(b.planValue).toBeCloseTo(b.mean, 5)
  })

  it('does not act on the learned value before MIN_SAMPLE answers, and ranges narrow with data', () => {
    const few = belief(PRIORS.heater, 3, 5)
    expect(few.sufficient).toBe(false)
    expect(few.planValue).toBeCloseTo(0.9, 5)
    const many = belief(PRIORS.heater, 60, 40)
    expect(many.hi - many.lo).toBeLessThan(belief(PRIORS.heater, 24, 16).hi - belief(PRIORS.heater, 24, 16).lo)
    expect(MIN_SAMPLE).toBe(15)
  })
})

const beliefsWith = (heater: Belief): Record<MemoryKey, Belief> =>
  Object.fromEntries(
    (Object.keys(PRIORS) as MemoryKey[]).map((k) => [k, k === 'heater' ? heater : belief(PRIORS[k], 0, 0)]),
  ) as Record<MemoryKey, Belief>

describe('Survival Burning Risk', () => {
  const unconfirmed = { heater: 'distributed' as const, warmKits: 0, fireReports: 0 }

  it("Shyam's gate is high risk on the coldest, stillest night and low on a warm windy one", () => {
    const cold = burningRisk(shyam, nightAsWeather(coldest), { ...unconfirmed, heater: 'failed' }, 0.9)
    expect(cold.level).toBe('high')
    expect(cold.stagnation).toBe(1)
    expect(burningRisk(shyam, warmNight, { ...unconfirmed, heater: 'failed' }, 0.9).level).toBe('low')
  })

  it('learning that heaters are used less raises risk at gates whose heater is only "distributed"', () => {
    const w = nightAsWeather(coldest)
    expect(burningRisk(shyam, w, unconfirmed, 0.63).score).toBeGreaterThan(burningRisk(shyam, w, unconfirmed, 0.9).score)
    expect(burningRisk(shyam, w, { ...unconfirmed, heater: 'working' }, 0.63).level).not.toBe('high')
  })

  it('exposure dose weights the homeless above commuters', () => {
    const station = nodes.find((n) => n.id === 'station')!
    expect(exposureDose(station.winter)).toBeGreaterThan(exposureDose({ ...station.winter, people: { commuter: 27 } }))
  })
})

describe('Budget planner uses verified effectiveness', () => {
  /** node contexts as the planner would see them, given what Pulse has told us so far */
  const contextsFor = (heaterRate: number, failed: string[] = []): NodeContext[] =>
    nodes.map((n) => {
      const heater: NodeContext['heater'] = failed.includes(n.id)
        ? 'failed_fixable'
        : n.winter.heater === 'distributed' ? 'unconfirmed' : 'none'
      const st = heater === 'failed_fixable' ? 'failed' : heater === 'unconfirmed' ? 'distributed' : 'none'
      return {
        node: n,
        hazard: burningRisk(n, nightAsWeather(coldest), { heater: st, warmKits: 0, fireReports: 0 }, heaterRate).score / 100,
        heater,
      }
    })
  const prior = beliefsWith(belief(PRIORS.heater, 0, 0))
  const learned = beliefsWith(belief(PRIORS.heater, 24, 16))

  it('stays within budget and returns ranges around each estimate', () => {
    const plan = planBudget({ season: 'sardi', budget: 60000, contexts: contextsFor(0.9), beliefs: prior })
    expect(plan.spent).toBeLessThanOrEqual(60000)
    expect(plan.picks.length).toBeGreaterThan(0)
    expect(plan.pehLo).toBeLessThan(plan.peh)
    expect(plan.pehHi).toBeGreaterThan(plan.peh)
  })

  it('once Pulse finds which heaters are unused and why, money moves to socket fixes, not more heaters', () => {
    const before = planBudget({ season: 'sardi', budget: 100000, contexts: contextsFor(0.9), beliefs: prior })
    const after = planBudget({
      season: 'sardi', budget: 100000, beliefs: learned,
      contexts: contextsFor(0.633, ['shyam-gate', 'defence-gate', 'mits-gate']),
    })
    const shift = budgetShift(before, after)
    const socket = shift.find((s) => s.kind === 'socket_fix')!
    expect(socket.before).toBe(0)
    expect(socket.after).toBeGreaterThan(0)
    const heater = shift.find((s) => s.kind === 'heater')
    expect(heater?.after ?? 0).toBeLessThanOrEqual(heater?.before ?? 0)
  })

  it('without knowing which heaters fail, it does not fund blanket socket fixes', () => {
    const plan = planBudget({ season: 'sardi', budget: 100000, contexts: contextsFor(0.633), beliefs: learned })
    expect(plan.byKind.socket_fix).toBeUndefined()
  })

  it('a heater Pulse found unused for a fixable reason gets a socket fix, not a new heater', () => {
    const plan = planBudget({ season: 'sardi', budget: 100000, contexts: contextsFor(0.633, ['shyam-gate']), beliefs: learned })
    expect(plan.picks.some((p) => p.nodeId === 'shyam-gate' && p.kind === 'socket_fix')).toBe(true)
    expect(plan.picks.some((p) => p.nodeId === 'shyam-gate' && p.kind === 'heater')).toBe(false)
  })

  it('balanced mode serves the most vulnerable first when money is short', () => {
    const plan = planBudget({ season: 'sardi', budget: 15000, contexts: contextsFor(0.633), beliefs: learned })
    const top = nodes.find((n) => n.id === plan.picks[0].nodeId)!
    expect((top.winter.people.homeless ?? 0) + (top.winter.people.labour ?? 0) + (top.winter.people.attendant ?? 0)).toBeGreaterThan(0)
  })
})

describe('Season replay', () => {
  const replay = simulateWinter(nights)
  const last = replay.nights.at(-1)!

  it('covers every night of winter 2025-26 with real weather', () => {
    expect(replay.nights.length).toBe(90)
    expect(replay.nights[0].date).toBe('2025-12-01')
  })

  it('switches the plan only once MIN_SAMPLE answers are in, then learns close to the truth', () => {
    const firstSwitch = replay.nights.findIndex((n) => n.switched)
    expect(replay.nights[firstSwitch].heater.n).toBeGreaterThanOrEqual(MIN_SAMPLE)
    expect(replay.nights[firstSwitch - 1].heater.n).toBeLessThan(MIN_SAMPLE)
    expect(Math.abs(last.heater.mean - replay.truthRate)).toBeLessThan(0.12)
    expect(last.heater.lo).toBeLessThan(replay.truthRate)
    expect(last.heater.hi).toBeGreaterThan(replay.truthRate)
  })

  it('keeps estimated and verified apart, with verified never above estimated', () => {
    for (const n of replay.nights) expect(n.verifiedTotal).toBeLessThanOrEqual(n.estimatedTotal + 1e-6)
    expect(last.verifiedTotal).toBeGreaterThan(0)
  })

  it("tells Shyam's story: 'no socket' first, then fixed and confirmed", () => {
    const shyamEvents = replay.nights.flatMap((n) => n.events.filter((e) => e.shyam))
    expect(shyamEvents[0]).toMatchObject({ kind: 'pulse', ok: false, reason: 'no_socket' })
    expect(shyamEvents.some((e) => e.kind === 'recheck' && e.ok)).toBe(true)
  })
})

describe('Shade Clock', async () => {
  const { makeScene, shadeProfile, sunAt, sunWindow, bestMove, shadowsAt, istTime } = await import('./shade')

  it('sun is almost overhead at noon in May and low in December (Gwalior, 26.2 N)', () => {
    const may = sunAt(istTime('2026-05-19', 12 * 60 + 15), 26.21, 78.18)
    const dec = sunAt(istTime('2025-12-21', 12 * 60 + 15), 26.21, 78.18)
    expect(may.altitude).toBeGreaterThan(80)
    expect(dec.altitude).toBeGreaterThan(38)
    expect(dec.altitude).toBeLessThan(42)
    expect(dec.dir[1]).toBeLessThan(0) // December noon sun is in the south
  })

  it('morning shadows fall west, evening shadows fall east', () => {
    const scene = makeScene(shyam)
    const b = scene.buildings[0]
    const cx = b.poly.reduce((a, p) => a + p[0], 0) / b.poly.length
    const shadowX = (m: number) => {
      const s = shadowsAt(scene, istTime('2026-05-19', m)).buildings[0]
      return s.reduce((a, p) => a + p[0], 0) / s.length
    }
    expect(shadowX(8 * 60)).toBeLessThan(cx)
    expect(shadowX(17 * 60)).toBeGreaterThan(cx)
  })

  it("gives a day profile, a sun window in the shift and a no-cost move for Shyam's gate", () => {
    const scene = makeScene(shyam)
    const profile = shadeProfile(scene, '2026-05-19')
    expect(profile.length).toBe(27)
    for (const s of profile) expect(s.shade).toBeGreaterThanOrEqual(0)
    const win = sunWindow(profile, shyam.summer.hours)
    if (win) expect(win[1]).toBeGreaterThan(win[0])
    const move = bestMove(scene, '2026-05-19')
    expect(move.hours).toBeGreaterThanOrEqual(move.here)
    expect(move.dist).toBeLessThanOrEqual(40)
  })
})
