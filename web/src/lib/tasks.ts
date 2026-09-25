/**
 * Applied plans become tasks: Planned -> Delivered -> Confirmed working (only from a check).
 * Every check is kept as its own dated record (call, night visit, smart plug), so an old
 * "yes" can expire and the learning can see what changed month by month. Fire reports and
 * worker "Ask for help" requests live here too. Saved on this device; every change notifies
 * subscribers so "Did the help work?" updates at once.
 */
import { useSyncExternalStore } from 'react'
import type { HelpType } from './plan'

export type TaskStatus = 'planned' | 'delivered' | 'working' | 'failed'
/** Access Friction: why help that exists is not in use. A short fixed list, so reasons add up. */
export type FailReason =
  | 'no_socket' | 'no_permission' | 'bill_fear' | 'broken' | 'never_reached'
  | 'power_cut' | 'kept_away' | 'guard_changed'
export const FAIL_REASONS: FailReason[] = ['no_socket', 'no_permission', 'bill_fear', 'broken', 'never_reached', 'power_cut', 'kept_away', 'guard_changed']

/** "Check before handing over": without all three a heater is not marked delivered. */
export interface Precheck {
  socket: boolean
  /** the RWA (or owner) said yes to paying the electricity bill */
  bill: boolean
  /** who is on the night shift (name or phone) */
  guard: string
}
export const precheckDone = (p?: Precheck) => !!p && p.socket && p.bill && p.guard.trim().length > 1
/** Help that only works when plugged in needs the pre-check. */
export const needsPrecheck = (h: HelpType) => h === 'heater' || h === 'socket_fix'

export interface Task {
  id: string
  pointId: string
  pointName: string
  pointNameHi: string
  lat: number
  lon: number
  help: HelpType
  qty: number
  cost: number
  people: number
  /** hours per day this help covers for each person (shift length) */
  shiftHours: number
  status: TaskStatus
  reason?: FailReason
  photo?: string
  precheck?: Precheck
  deliveredAt?: number
  createdAt: number
  updatedAt: number
  demo?: boolean
}

/** call: the Pulse call; visit: a partner or volunteer at night; plug: a consented smart plug that only sees the heater. */
export type Signal = 'call' | 'visit' | 'plug'
export const SIGNALS: Signal[] = ['call', 'visit', 'plug']

export interface Check {
  id: string
  taskId: string
  at: number
  signal: Signal
  ok: boolean
  reason?: FailReason
  /** "What time did you switch it on last night?" (hour 0-23). Asked instead of a bare yes/no. */
  ranFrom?: number
  demo?: boolean
}

/** Someone saw a fire lit for warmth at this point. If its heater "works", that is a contradiction. */
export interface FireReport {
  id: string
  pointId: string
  at: number
}

export type AskNeed = 'water' | 'shade' | 'warm' | 'heater' | 'shelter' | 'medical' | 'other'
export interface HelpRequest {
  id: string
  need: AskNeed
  place: string
  lat: number
  lon: number
  work?: string
  createdAt: number
}

export interface Db {
  tasks: Task[]
  checks: Check[]
  fires: FireReport[]
  requests: HelpRequest[]
}
const KEY = 'bm:db'
const EMPTY: Db = { tasks: [], checks: [], fires: [], requests: [] }
let db: Db = read()
const subs = new Set<() => void>()

function read(): Db {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Db> | null
    if (d && Array.isArray(d.tasks)) return { tasks: d.tasks, checks: d.checks ?? [], fires: d.fires ?? [], requests: d.requests ?? [] }
  } catch {
    /* ignore */
  }
  return EMPTY
}
function write(next: Db) {
  db = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* photo too big or storage blocked: keep it in memory */
  }
  subs.forEach((f) => f())
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      db = read()
      subs.forEach((f) => f())
    }
  })
}
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)

export const taskStore = {
  subscribe(f: () => void) {
    subs.add(f)
    return () => subs.delete(f)
  },
  get: () => db,
  addTasks(ts: Omit<Task, 'id' | 'status' | 'createdAt' | 'updatedAt'>[]) {
    const now = Date.now()
    write({ ...db, tasks: [...ts.map((t) => ({ ...t, id: uid(), status: 'planned' as const, createdAt: now, updatedAt: now })), ...db.tasks] })
  },
  update(id: string, patch: Partial<Task>) {
    write({ ...db, tasks: db.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)) })
  },
  deliver(id: string) {
    const now = Date.now()
    write({ ...db, tasks: db.tasks.map((t) => (t.id === id ? { ...t, status: 'delivered', deliveredAt: now, updatedAt: now } : t)) })
  },
  /** A check answer: the task's status follows the newest answer. */
  record(taskId: string, c: Omit<Check, 'id' | 'taskId' | 'at'>, at = Date.now()) {
    const check: Check = { ...c, id: uid(), taskId, at }
    write({
      ...db,
      checks: [...db.checks, check],
      tasks: db.tasks.map((t) => (t.id === taskId ? { ...t, status: c.ok ? 'working' : 'failed', reason: c.ok ? undefined : c.reason, updatedAt: at } : t)),
    })
    return check
  },
  reportFire(pointId: string) {
    write({ ...db, fires: [...db.fires, { id: uid(), pointId, at: Date.now() }] })
  },
  ask(r: Omit<HelpRequest, 'id' | 'createdAt'>) {
    const req = { ...r, id: uid(), createdAt: Date.now() }
    write({ ...db, requests: [req, ...db.requests] })
    return req
  },
  clear() {
    write(EMPTY)
  },
}

export function useDb() {
  return useSyncExternalStore(taskStore.subscribe, taskStore.get, taskStore.get)
}
