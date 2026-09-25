import { useMemo } from 'react'
import { useApp, useDay } from '../ctx'
import { useI18n } from '../i18n'
import { demoHistory, learn, taskState, type History, type Learning } from '../lib/checks'
import { hourLabel, istHour, weekday } from '../lib/ist'
import { FILE_HEATER_RATE } from '../lib/plan'
import {
  nightPersonHours, pointRisk, protectionOf, resilienceDebt, SHIFT_HOURS, topNeed, type Point, type PointRisk, type Protection, type TopNeed,
} from '../lib/points'
import { coldLevel, conditionOf, dayLevel, heatLevel, modesForDay, nightHours, rainFrom, trendOf, type Day, type Heater, type Mode } from '../lib/risk'
import { useDb, type Check, type FireReport, type Task } from '../lib/tasks'
import { useWxText } from '../ui/atoms'

// ---------- all help: last winter's demo programme + what was done on this device ----------

export interface Help extends History {
  /** local tasks only (what partners act on) */
  local: Task[]
  fires: FireReport[]
  learning: Learning
  /** the share of heaters that really run, as the plan should use it */
  heaterRate: number
  demo: boolean
}

/** Demo history is built once per pilot, anchored to its real points that have heaters. */
export function useHelp(): Help {
  const { place, pts } = useApp()
  const db = useDb()
  const pilot = place.pilot
  return useMemo(() => {
    let demo: History = { tasks: [], checks: [], events: [], priority: new Set() }
    if (pilot && pts.points) {
      // Shyam's gate first, then the other gates, ATMs and sites with a heater
      const anchors = pts.points
        .filter((p) => p.heater && p.heater !== 'none' && p.people.some((c) => c.group === 'guard' && c.shift === 'night'))
        .sort((a, b) => Number(b.id === 'shyam-gate') - Number(a.id === 'shyam-gate'))
      demo = demoHistory(anchors)
    }
    const tasks = [...demo.tasks, ...db.tasks]
    const checks: Check[] = [...demo.checks, ...db.checks]
    const learning = learn(tasks, checks)
    const b = learning.adjusted
    return {
      ...demo, tasks, checks, local: db.tasks, fires: db.fires, learning,
      heaterRate: b.n >= 15 ? b.mean : FILE_HEATER_RATE,
      demo: demo.tasks.length > 0,
    }
  }, [pilot, pts.points, db])
}

/** A point's heater as far as checks on this device know; an old "yes" no longer counts. */
export function heaterFor(p: Point, help: Pick<Help, 'local' | 'checks' | 'fires'>, now = Date.now()): Heater | undefined {
  const mine = help.local
    .filter((t) => t.pointId === p.id && (t.help === 'socket_fix' || t.help === 'heater') && t.status !== 'planned')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (!mine) return p.heater
  const st = taskState(mine, help.checks, help.fires, now)
  if (st.status === 'fresh') return 'working'
  if (st.status === 'stopped') return 'failed'
  return 'unconfirmed'
}

export interface Row {
  point: Point
  risk: PointRisk
  need: TopNeed
  heater: Heater | undefined
  tasks: Task[]
  protection: Protection
  debt: number
  fires: number
}

/** Points with today's (or tomorrow's) danger, most Resilience Debt first. */
export function useRows(idx?: 0 | 1): Row[] {
  const { pts } = useApp()
  const { day, next, modes } = useDay(idx)
  const help = useHelp()
  return useMemo(() => {
    if (!day || !pts.points) return []
    const info = conditionOf(day, next)
    const { hz } = info
    // the top need follows the screen, so a warm afternoon asks for shade and water
    const dayModes = modesForDay(modes, info)
    const hazards = { heat: hz.heat >= 1, cold: hz.cold >= 1, air: hz.air >= 2 }
    const rows = pts.points.map((point) => {
      const heater = heaterFor(point, help)
      const fires = help.fires.filter((f) => f.pointId === point.id).length
      const tasks = help.local.filter((t) => t.pointId === point.id)
      const confirmed = new Set<string>()
      for (const t of tasks) {
        if (t.status !== 'working') continue
        if (t.help === 'shade_canopy') confirmed.add('shade')
        if (t.help === 'water_point') confirmed.add('water')
        if (t.help === 'warm_kit') confirmed.add('warm_kit')
        if (t.help === 'masks') confirmed.add('masks')
        if (t.help === 'shelter_ride') confirmed.add('shelter')
      }
      return {
        point, heater, tasks, fires,
        risk: pointRisk(point, day, next, modes, { heater, heaterRate: help.heaterRate, reports: fires }),
        need: topNeed(point, dayModes, heater),
        protection: protectionOf(point, hazards, { heater, heaterRate: help.heaterRate, confirmed }),
      }
    })
    const max = Math.max(0, ...rows.map((r) => r.risk.score))
    return rows
      .map((r) => ({ ...r, debt: resilienceDebt(r.risk.score, max, r.protection.share) }))
      .sort((a, b) => b.debt - a.debt || b.risk.level - a.risk.level || b.risk.score - a.risk.score)
  }, [day, next, modes, pts.points, help])
}

/** "1 guard, night · 20 attendants, night" */
export function usePeople() {
  const { t } = useI18n()
  return (p: Point) =>
    p.people
      .map((c) => `${c.count} ${t.group[c.group][c.count === 1 ? 0 : 1]}, ${t.shiftWord[c.shift]}`)
      .join(' · ')
}

/** "28 attendants · night, 8 pm to 8 am · 12 h outside" per crew */
export function useCrews() {
  const { t, f } = useI18n()
  return (p: Point) =>
    p.people.map((c) => `${c.count} ${t.group[c.group][c.count === 1 ? 0 : 1]} · ${t.shiftSpan[c.shift]} · ${f(t.who.hoursOut, { n: SHIFT_HOURS })}`)
}

export { nightPersonHours }

export const pointName = (p: Point, lang: 'en' | 'hi') => (lang === 'hi' ? p.nameHi || p.name : p.name || p.nameHi)

/** The one plain sentence: "Mild and cloudy. Low heat risk. Rain possible after 4 pm." */
export function useSentence() {
  const { t, f, lang } = useI18n()
  const wxText = useWxText()
  return (day: Day, modes: Mode[], fromHour = 0, next?: Day) => {
    const word = wxText(day.code)
    const cond = conditionOf(day, next).cond
    const lead = modes[0] === 'mild' && cond === 'warm' ? t.cond.short.warm : t.today.modeLine[modes[0]]
    const a = f(t.today.and, { a: lead, b: lang === 'en' ? word.toLowerCase() : word })
    const level = dayLevel(day)
    const heat = Math.max(0, ...day.hours.map((h) => heatLevel(h.feels)))
    const cold = Math.max(0, ...nightHours(day, next).map((h) => coldLevel(h.feels)))
    const kind = level > Math.max(heat, cold) ? t.today.kind.air : cold > heat ? t.today.kind.cold : t.today.kind.heat
    const parts = [a, f(t.today.risk[level], { kind })]
    const r = rainFrom(day, fromHour)
    if (r != null) parts.push(f(t.today.rainAfter, { time: hourLabel(r, lang) }))
    return parts.join(' ')
  }
}

/** "Warmer from Sunday: up to 33°" for Mild days. */
export function useTrend() {
  const { t, f, lang } = useI18n()
  const { wx } = useApp()
  const tr = wx ? trendOf(wx.data.days) : null
  if (!tr) return null
  if (tr.kind === 'same') return f(t.today.same, { min: tr.min, max: tr.max })
  return f(tr.kind === 'warmer' ? t.today.warmer : t.today.cooler, { day: weekday(tr.date, lang), t: tr.value })
}

/** The "now" hour for the strip marker: only on the live Today tab. */
export function useNowHour(idx: 0 | 1): number | null {
  const { replay } = useApp()
  if (idx !== 0 || replay) return null
  return istHour()
}

/** 0.53 -> "53%" */
export const pct = (x: number) => `${Math.round(x * 100)}%`
