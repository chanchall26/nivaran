/**
 * Schemes: help types with demo costs, and a greedy planner that buys the most protected
 * person-hours per rupee. "Equal share" first gives every ward a minimum slice of the budget.
 * Protected hours are counted over the next 30 days with simple demo effect sizes.
 *
 * Heaters are valued at the share that REALLY run (Intervention Memory, checks.ts): the file
 * assumes 9 in 10; once calls and night visits say ~5 in 10, a new heater is worth less, a
 * socket + bill-permission fix on a heater that is already there is worth more, and warm kits
 * win where a socket can't be fixed. The money moves by itself.
 */
import type { Point } from './points'
import type { Heater, Mode } from './risk'

export type HelpType = 'heater' | 'warm_kit' | 'socket_fix' | 'shelter_ride' | 'masks' | 'water_point' | 'shade_canopy' | 'trees'

export interface HelpInfo {
  cost: number
  per: 'person' | 'point' | 'tree'
  starts: 'tonight' | 'today' | 'week' | 'years'
  modes: Mode[]
}
export const HELP: Record<HelpType, HelpInfo> = {
  heater: { cost: 1200, per: 'point', starts: 'tonight', modes: ['cold'] },
  warm_kit: { cost: 800, per: 'person', starts: 'tonight', modes: ['cold'] },
  socket_fix: { cost: 1000, per: 'point', starts: 'tonight', modes: ['cold'] },
  shelter_ride: { cost: 300, per: 'person', starts: 'tonight', modes: ['cold', 'rain'] },
  masks: { cost: 50, per: 'person', starts: 'today', modes: ['smoky'] },
  water_point: { cost: 8000, per: 'point', starts: 'week', modes: ['heat', 'humid'] },
  shade_canopy: { cost: 25000, per: 'point', starts: 'week', modes: ['heat', 'humid'] },
  trees: { cost: 3000, per: 'tree', starts: 'years', modes: ['heat'] },
}
export const HELP_ORDER: HelpType[] = ['socket_fix', 'warm_kit', 'heater', 'shelter_ride', 'masks', 'water_point', 'shade_canopy', 'trees']

/** What the file assumes before anyone checks: a handed-out heater runs 9 times in 10. */
export const FILE_HEATER_RATE = 0.9
/** A heater that runs protects most of the night; a warm kit about half of it. */
const HEATER_RELIEF = 0.9
const KIT_RELIEF = 0.5

const DAYS = 30
const SHIFT_H = 12

export interface Option {
  point: Point
  help: HelpType
  qty: number
  cost: number
  /** people this reaches */
  people: number
  /** protected person-hours over the next 30 days (demo effect sizes) */
  hours: number
}

/**
 * Every help that makes sense at this point for these modes. `heaterRate` is the share of
 * handed-out heaters that really run (the file's 0.9 until checks say otherwise).
 */
export function optionsFor(p: Point, modes: Mode[], heater?: Heater, heaterRate = FILE_HEATER_RATE): Option[] {
  const out: Option[] = []
  const night = p.people.filter((c) => c.shift === 'night')
  const day = p.people.filter((c) => c.shift === 'day')
  const sum = (cs: typeof p.people) => cs.reduce((a, c) => a + c.count, 0)
  const nNight = sum(night)
  const nDay = sum(day)
  const nAll = nNight + nDay
  const h = heater ?? p.heater
  const add = (help: HelpType, qty: number, people: number, hours: number) => {
    if (qty > 0 && hours > 0) out.push({ point: p, help, qty, cost: qty * HELP[help].cost, people, hours: Math.round(hours) })
  }
  const night30 = SHIFT_H * DAYS
  if (modes.includes('cold')) {
    const guards = sum(night.filter((c) => c.group === 'guard'))
    const others = sum(night.filter((c) => c.group !== 'homeless' && c.group !== 'guard'))
    const homeless = sum(night.filter((c) => c.group === 'homeless'))
    // share of a guard's night still cold, given the heater there
    const uncovered = h === 'working' ? 0.1 : h === 'unconfirmed' ? 1 - heaterRate : 1
    if (guards > 0 && (h === 'none' || h === undefined)) add('heater', 1, guards, guards * night30 * HEATER_RELIEF * heaterRate)
    // a heater that is there but not running: fit the socket and get the bill permission
    if (guards > 0 && (h === 'unconfirmed' || h === 'failed')) add('socket_fix', 1, guards, guards * night30 * HEATER_RELIEF * (h === 'failed' ? 0.8 : 1 - heaterRate))
    const kitHours = (guards * (h === 'none' || h === undefined ? 1 : uncovered) + others) * night30 * KIT_RELIEF
    add('warm_kit', guards + others, guards + others, kitHours)
    add('shelter_ride', homeless, homeless, homeless * SHIFT_H * 7 * 0.7)
  }
  if (modes.includes('rain') && !modes.includes('cold')) {
    const homeless = night.filter((c) => c.group === 'homeless').reduce((a, c) => a + c.count, 0)
    add('shelter_ride', homeless, homeless, homeless * SHIFT_H * 7 * 0.6)
  }
  if (modes.includes('smoky')) add('masks', nAll, nAll, nAll * 8 * 7 * 0.5)
  if (modes.includes('heat') || modes.includes('humid')) {
    if (nDay > 0 && !p.offers?.includes('water')) add('water_point', 1, nDay, nDay * 8 * DAYS * 0.3)
    if (nDay > 0 && !p.offers?.includes('shade')) add('shade_canopy', 1, nDay, nDay * 4 * DAYS * 0.6)
  }
  return out
}

/**
 * Protected person-hours per ₹1,000 for one guard over 30 nights, at a given heater rate: the
 * table that explains why the plan changed. New heater and warm kit are for a gate with no
 * heater; the socket fix is for a gate whose heater is there but not confirmed running.
 */
export function heaterValue(rate: number) {
  const perK = (hours: number, cost: number) => Math.round((hours / cost) * 1000)
  return {
    heater: perK(night30h() * HEATER_RELIEF * rate, HELP.heater.cost),
    socket_fix: perK(night30h() * HEATER_RELIEF * (1 - rate), HELP.socket_fix.cost),
    /** where there is no heater at all */
    warm_kit: perK(night30h() * KIT_RELIEF, HELP.warm_kit.cost),
  }
}
const night30h = () => SHIFT_H * DAYS

export interface Plan {
  picks: Option[]
  spent: number
  left: number
  hours: number
  people: number
}

/**
 * Greedy by protected hours per rupee. With `equalShare`, half the budget is first split
 * evenly across wards and spent inside each ward; the rest goes to the best options anywhere.
 */
export function suggestPlan(options: Option[], budget: number, equalShare: boolean): Plan {
  const pool = [...options].sort((a, b) => b.hours / b.cost - a.hours / a.cost)
  const taken = new Set<Option>()
  let left = Math.max(0, Math.floor(budget))

  const take = (o: Option, cap: number) => {
    if (taken.has(o)) return 0
    if (o.cost <= cap) {
      taken.add(o)
      return o.cost
    }
    // per-person help can be partly bought
    if (HELP[o.help].per === 'person') {
      const unit = HELP[o.help].cost
      const q = Math.floor(cap / unit)
      if (q > 0) {
        const part: Option = { ...o, qty: q, cost: q * unit, people: Math.min(o.people, q), hours: Math.round((o.hours * q) / o.qty) }
        taken.add(part)
        pool[pool.indexOf(o)] = part
        return part.cost
      }
    }
    return 0
  }

  if (equalShare) {
    const wards = [...new Set(pool.map((o) => o.point.ward || '-'))]
    const share = Math.floor((left * 0.5) / Math.max(1, wards.length))
    for (const w of wards) {
      let cap = share
      for (const o of pool.filter((x) => (x.point.ward || '-') === w)) {
        const spent = take(o, cap)
        cap -= spent
        left -= spent
      }
    }
  }
  for (const o of [...pool]) left -= take(o, left)

  const picks = pool.filter((o) => taken.has(o))
  return {
    picks,
    spent: picks.reduce((a, o) => a + o.cost, 0),
    left,
    hours: picks.reduce((a, o) => a + o.hours, 0),
    people: picks.reduce((a, o) => a + o.people, 0),
  }
}
