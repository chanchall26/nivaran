/**
 * "Did the help work?" - the part of Barahmasa that calls back.
 *
 *  - A "yes" does not last forever. It counts as confirmed for 7 days. Before a cold night,
 *    anything older than 3 days is checked again first. After 3 weeks it is unknown.
 *  - Checks follow a schedule: the day after delivery, a week later, then every 2 weeks
 *    (a random 1 in 4 once help here works 9 times in 10).
 *  - A fire lit at a point whose heater "works" is a contradiction: check again now.
 *  - Learning: Intervention Memory (Beta-Binomial, see memory.ts) on the FIRST answer for
 *    each heater, then corrected by night visits: if visits find some "yes" answers were not
 *    true, every self-reported yes counts for less.
 *  - Protected Exposure Hours: Estimated assumes every delivered item works every night;
 *    Confirmed counts only nights inside a fresh "yes". The two are never mixed.
 */
import { addDays } from './ist'
import { belief, PRIORS, type Belief } from './memory'
import { FAIL_REASONS, type Check, type FailReason, type FireReport, type Task } from './tasks'

export const DAY = 86400_000
export const FULL_DAYS = 3
export const FRESH_DAYS = 7
export const EXPIRE_DAYS = 21

/** Stable 0..1 from an id, so "random" sampling does not change on every render. */
function hash01(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

// ---------- one task: is it confirmed right now, and when is the next check? ----------

export type Freshness = 'planned' | 'unchecked' | 'fresh' | 'recheck' | 'stopped' | 'unknown'
export type DueWhy = 'first' | 'week' | 'fortnight' | 'sample' | 'cold_night' | 'fire' | 'after_fix'

export interface TaskState {
  status: Freshness
  last?: Check
  /** days since the newest answer */
  age: number | null
  due: number | null
  why: DueWhy | null
  /** a fire was reported here after the last "yes" */
  contradiction: boolean
}

export function taskState(
  task: Task, checks: Check[], fires: FireReport[], now: number,
  o: { coldNightAt?: number | null; sampleRate?: number } = {},
): TaskState {
  if (task.status === 'planned') return { status: 'planned', age: null, due: null, why: null, contradiction: false }
  const mine = checks.filter((c) => c.taskId === task.id).sort((a, b) => a.at - b.at)
  const delivered = task.deliveredAt ?? task.updatedAt
  const last = mine[mine.length - 1]
  if (!last) return { status: 'unchecked', age: null, due: delivered + DAY, why: 'first', contradiction: false }
  const age = (now - last.at) / DAY
  if (!last.ok) return { status: 'stopped', last, age, due: last.at + FRESH_DAYS * DAY, why: 'after_fix', contradiction: false }

  const contradiction = fires.some((f) => f.pointId === task.pointId && f.at > last.at)
  if (contradiction) return { status: 'recheck', last, age, due: now, why: 'fire', contradiction }
  if (age > EXPIRE_DAYS) return { status: 'unknown', last, age, due: now, why: 'fortnight', contradiction }
  const yeses = mine.filter((c) => c.ok).length
  const inSample = hash01(task.id + yeses) < (o.sampleRate ?? 1)
  let why: DueWhy = yeses <= 1 ? 'week' : inSample ? 'fortnight' : 'sample'
  let due = last.at + (yeses <= 1 ? 7 : inSample ? 14 + Math.round(hash01(task.id) * 4 - 2) : 28) * DAY
  // a cold night is coming and the last "yes" is more than 3 days old: check before it
  if (o.coldNightAt != null && age > FULL_DAYS && o.coldNightAt - now < 2 * DAY && o.coldNightAt > now && due > now) {
    due = now
    why = 'cold_night'
  }
  const status: Freshness = now >= due || age > FRESH_DAYS ? 'recheck' : 'fresh'
  return { status, last, age, due, why, contradiction }
}

// ---------- learning ----------

export interface Learning {
  /** what the file assumed ("distributed = working") */
  prior: number
  /** from the first answer for each heater */
  calls: Belief
  /** night visits that checked a self-reported "yes" */
  visits: { n: number; agreed: number }
  /** share of self-reported "yes" answers that visits found true (1 until 5 visits) */
  trust: number
  /** calls corrected by visits: what the plan uses */
  adjusted: Belief
}

/** Heater-type help: the learning is about whether a heater really runs. */
const isHeat = (t: Task) => t.help === 'heater' || t.help === 'socket_fix'

export function learn(tasks: Task[], checks: Check[]): Learning {
  const heat = new Set(tasks.filter(isHeat).map((t) => t.id))
  const byTask = new Map<string, Check[]>()
  for (const c of [...checks].sort((a, b) => a.at - b.at)) {
    if (!heat.has(c.taskId)) continue
    const l = byTask.get(c.taskId) ?? []
    l.push(c)
    byTask.set(c.taskId, l)
  }
  let yes = 0
  let no = 0
  let selfYes = 0
  let visitN = 0
  let visitAgree = 0
  for (const cs of byTask.values()) {
    const first = cs[0]
    if (first.ok) yes++
    else no++
    if (first.ok && first.signal === 'call') selfYes++
    // a visit right after a self-reported yes tests that answer
    cs.forEach((c, i) => {
      if (c.signal !== 'visit' || i === 0) return
      const prev = cs[i - 1]
      if (prev.signal === 'call' && prev.ok) {
        visitN++
        if (c.ok) visitAgree++
      }
    })
  }
  const trust = visitN >= 5 ? visitAgree / visitN : 1
  const calls = belief(PRIORS.heater, yes, no)
  const lost = selfYes * (1 - trust)
  return { prior: calls.priorMean, calls, visits: { n: visitN, agreed: visitAgree }, trust, adjusted: belief(PRIORS.heater, yes - lost, no + lost) }
}

/** Month by month: of the heaters checked that month, how many were running at their last check. */
export function monthlyTrend(tasks: Task[], checks: Check[]) {
  const heat = new Set(tasks.filter(isHeat).map((t) => t.id))
  const months = new Map<string, Map<string, Check>>()
  for (const c of [...checks].sort((a, b) => a.at - b.at)) {
    if (!heat.has(c.taskId)) continue
    const m = monthOf(c.at)
    const latest = months.get(m) ?? new Map<string, Check>()
    latest.set(c.taskId, c)
    months.set(m, latest)
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, latest]) => {
      const vals = [...latest.values()]
      const yes = vals.filter((c) => c.ok).length
      return { month, n: vals.length, yes, belief: belief(PRIORS.heater, yes, vals.length - yes) }
    })
}

/** Why help is not working: the newest failed answer for each item. */
export function reasonCounts(tasks: Task[], checks: Check[], from = 0, to = Infinity) {
  const ids = new Set(tasks.map((t) => t.id))
  const latest = new Map<string, Check>()
  for (const c of [...checks].sort((a, b) => a.at - b.at)) if (ids.has(c.taskId) && c.at >= from && c.at < to) latest.set(c.taskId, c)
  const out = Object.fromEntries(FAIL_REASONS.map((r) => [r, 0])) as Record<FailReason, number>
  for (const c of latest.values()) if (!c.ok && c.reason) out[c.reason]++
  return out
}

// ---------- Protected Exposure Hours ----------

export interface Peh {
  /** every delivered item assumed working every night */
  estimated: number
  /** only nights inside a fresh "yes" (7 days), cut short by a later "no" */
  confirmed: number
  /** nights a check found the help not working */
  failed: number
  /** nights nobody had checked recently */
  unknown: number
}

/** Person-hours between two dates (ms, day by day). */
export function peh(tasks: Task[], checks: Check[], from: number, to: number): Peh {
  const out: Peh = { estimated: 0, confirmed: 0, failed: 0, unknown: 0 }
  const by = new Map<string, Check[]>()
  for (const c of checks) by.set(c.taskId, [...(by.get(c.taskId) ?? []), c])
  for (const t of tasks) {
    if (t.status === 'planned' || t.deliveredAt == null) continue
    const cs = (by.get(t.id) ?? []).sort((a, b) => a.at - b.at)
    const ph = t.people * t.shiftHours
    for (let d = Math.max(from, startOfDay(t.deliveredAt)); d < to; d += DAY) {
      out.estimated += ph
      let last: Check | undefined
      for (const c of cs) if (c.at <= d + DAY - 1) last = c
      if (!last) out.unknown += ph
      else if (!last.ok) out.failed += ph
      else if (d + DAY - 1 - last.at <= FRESH_DAYS * DAY) out.confirmed += ph
      else out.unknown += ph
    }
  }
  return out
}

/** Right now, per night: what the file says vs what fresh checks confirm. */
export function pehTonight(tasks: Task[], checks: Check[], now: number) {
  return peh(tasks, checks, startOfDay(now), startOfDay(now) + DAY)
}

// ---------- dates ----------

const IST = 5.5 * 3600_000
export const startOfDay = (ms: number) => Math.floor((ms + IST) / DAY) * DAY - IST
export const monthOf = (ms: number) => new Date(ms + IST).toISOString().slice(0, 7)
export const at = (iso: string, hour = 9) => Date.parse(`${iso}T${String(hour).padStart(2, '0')}:00:00+05:30`)

// ---------- demo history: last winter's heater programme ----------

export interface DemoEvent {
  taskId: string
  at: number
  kind: 'fix' | 'flag' | 'bill_support'
}
export interface History {
  tasks: Task[]
  checks: Check[]
  events: DemoEvent[]
  /** CSR: heaters placed where tonight's fire risk was Medium or High on the coldest night */
  priority: Set<string>
}

/**
 * Winter 2025-26, all DEMO DATA, built to be easy to follow:
 *   1 Dec: 60 heaters handed out. December: 40 first calls, 24 say yes (63%, range 51-75%).
 *   Heater 1 is Shyam's gate: no socket -> socket fitted -> yes -> bill fear on 27 Dec ->
 *   flagged before the cold night of 29 Dec -> bill support -> yes again.
 *   January: sockets and bill permission fixed where possible, 10 night visits (8 of 10 "yes"
 *   answers held up) and 40 re-checks: 17 still running (48%).
 * Real points with a heater (e.g. `shyam-gate`) are used first so their card shows the history.
 */
export function demoHistory(anchors: { id: string; name: string; nameHi: string; lat: number; lon: number }[]): History {
  const tasks: Task[] = []
  const checks: Check[] = []
  const events: DemoEvent[] = []
  const priority = new Set<string>()
  const delivered = at('2025-12-01', 11)
  for (let i = 0; i < 60; i++) {
    const a = anchors[i]
    tasks.push({
      id: `demo-h${i}`, pointId: a?.id ?? `demo-site-${i}`,
      pointName: a?.name ?? `Heater site ${i + 1}`, pointNameHi: a?.nameHi ?? `हीटर जगह ${i + 1}`,
      lat: a?.lat ?? 0, lon: a?.lon ?? 0,
      help: 'heater', qty: 1, cost: 1200, people: i % 2 === 0 ? 2 : 1, shiftHours: 12,
      status: 'delivered', deliveredAt: delivered, createdAt: delivered - 5 * DAY, updatedAt: delivered, demo: true,
    })
    if (i % 10 < 7) priority.add(`demo-h${i}`)
  }
  let n = 0
  const add = (i: number, date: string, ok: boolean, reason?: FailReason, signal: Check['signal'] = 'call', hour = 10, ranFrom?: number) =>
    checks.push({ id: `demo-c${n++}`, taskId: `demo-h${i}`, at: at(date, hour), signal, ok, reason, ranFrom: ok ? (ranFrom ?? 20 + (i % 3)) : undefined, demo: true })

  // December: first calls for heaters 0-39, three or so a day from 2 Dec
  const first: (FailReason | null)[] = [
    'no_socket', 'no_socket', 'no_socket', 'no_socket', 'no_socket', 'no_socket',
    'bill_fear', 'bill_fear', 'bill_fear', 'bill_fear',
    'no_permission', 'no_permission', 'no_permission',
    'broken', 'broken', 'never_reached',
    ...Array<null>(24).fill(null),
  ]
  first.forEach((r, i) => add(i, addDays('2025-12-02', Math.floor((i * 13) / 40)), r == null, r ?? undefined))
  // Shyam's gate (heater 0)
  events.push({ taskId: 'demo-h0', at: at('2025-12-05', 12), kind: 'fix' })
  add(0, '2025-12-08', true, undefined, 'call', 10, 21)
  add(0, '2025-12-20', true, undefined, 'call', 10, 20)
  add(0, '2025-12-27', false, 'bill_fear')
  events.push({ taskId: 'demo-h0', at: at('2025-12-28', 9), kind: 'flag' })
  events.push({ taskId: 'demo-h0', at: at('2025-12-28', 15), kind: 'bill_support' })
  add(0, '2025-12-30', true, undefined, 'call', 10, 20)
  // one early "yes" breaks before the month ends
  add(16, '2025-12-24', false, 'broken')

  // January: fixes land, then re-checks
  for (const i of [1, 2, 3, 4, 5, 10, 11, 12]) events.push({ taskId: `demo-h${i}`, at: at('2026-01-04', 12), kind: 'fix' })
  for (const i of [1, 2, 3, 4, 10, 11]) add(i, '2026-01-07', true)
  add(5, '2026-01-07', false, 'no_socket')
  add(12, '2026-01-07', false, 'no_permission')
  events.push({ taskId: 'demo-h6', at: at('2026-01-05', 12), kind: 'bill_support' })
  add(6, '2026-01-08', true)
  for (const i of [7, 8, 9]) add(i, '2026-01-08', false, 'bill_fear')
  for (const i of [13, 14, 16]) add(i, '2026-01-09', false, 'broken')
  add(15, '2026-01-09', false, 'never_reached')
  add(0, '2026-01-10', true, undefined, 'call', 10, 20)
  // night visits test earlier "yes" answers: 8 of 10 hold up
  for (let k = 0; k < 10; k++) {
    const i = 17 + k
    const ok = i !== 25 && i !== 26
    add(i, addDays('2026-01-03', k), ok, ok ? undefined : i === 25 ? 'bill_fear' : 'kept_away', 'visit', 23)
  }
  add(27, '2026-01-14', true)
  const jan: FailReason[] = ['bill_fear', 'bill_fear', 'bill_fear', 'bill_fear', 'guard_changed', 'guard_changed', 'guard_changed', 'guard_changed', 'power_cut', 'power_cut', 'power_cut', 'kept_away']
  jan.forEach((r, k) => add(28 + k, addDays('2026-01-15', Math.floor(k / 2)), false, r))
  return { tasks, checks, events, priority }
}
