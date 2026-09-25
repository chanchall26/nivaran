import {
  CloudRain, Droplets, Flame, HeartPulse, House, Route, Shirt, ShieldCheck, Sun, Umbrella, Wind, type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { DAY, monthlyTrend, peh, reasonCounts, startOfDay, taskState, type TaskState } from '../lib/checks'
import { clockDate, hourLabel } from '../lib/ist'
import { coldLevel, LEVEL_COLOR, needsFor, nightHours, type Burning, type Mode, type Need } from '../lib/risk'
import { FAIL_REASONS, type Check, type Task } from '../lib/tasks'
import { DemoTag, ICON, LEVEL_TEXT, SectionHead, Src } from '../ui/atoms'
import type { EmojiName } from '../ui/Emoji'
import { useNow } from '../ui/Header'
import { pct, pointName, useHelp, usePeople, type Row } from './shared'

const NEED_ICON: Record<Need, LucideIcon> = {
  warm_kit: Shirt, heater_check: Flame, shelter_ride: House, no_fines: Flame,
  shade: Umbrella, water_ors: Droplets, work_hours: Sun, cool_rest: House,
  shade_breaks: Umbrella, dizzy: HeartPulse,
  sheet: CloudRain, dry_sleep: House, flood_roads: Route,
  masks: Wind, move_stalls: Wind, stop_burning: Flame, water_roads: Droplets,
  low_risk: ShieldCheck,
}

export function useLinkTo() {
  const { search } = useLocation()
  return (pathname: string, extra?: Record<string, string>) => {
    const q = new URLSearchParams(search)
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v)
    const s = q.toString()
    return { pathname, search: s ? `?${s}` : '' }
  }
}

// ---------- who needs help today ----------

/** "Has: shade, water · Missing: working heater" */
export function ProtectionLine({ row }: { row: Row }) {
  const { t } = useI18n()
  const has = row.protection.items.filter((x) => x.has >= 0.99)
  const partly = row.protection.items.filter((x) => x.has > 0 && x.has < 0.99)
  const missing = row.protection.items.filter((x) => x.has === 0)
  return (
    <span className="text-sm">
      {has.length > 0 && (
        <span>
          <b className="text-[#4ade80]">{t.who.has}:</b> {has.map((x) => t.who.guards[x.kind]).join(', ')}
        </span>
      )}
      {partly.length > 0 && (
        <span>
          {has.length > 0 && ' · '}
          {partly.map((x) => `${t.who.guards[x.kind]} (${pct(x.has)})`).join(', ')}
        </span>
      )}
      {missing.length > 0 && (
        <span>
          {(has.length > 0 || partly.length > 0) && ' · '}
          <b className="text-[#f87171]">{t.who.missing}:</b> {missing.map((x) => t.who.guards[x.kind]).join(', ')}
        </span>
      )}
    </span>
  )
}

export function WhoList({ rows, limit, plan }: { rows: Row[]; limit?: number; plan?: boolean }) {
  const { t, f, lang } = useI18n()
  const { pts } = useApp()
  const people = usePeople()
  const to = useLinkTo()
  if (pts.status === 'loading')
    return (
      <ul className="space-y-2" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="skel h-[76px]" />
        ))}
      </ul>
    )
  if (pts.status === 'error') return <p className="text-sm text-muted">{t.map.err}</p>
  if (!rows.length) return <p className="text-sm text-muted">{t.who.empty}</p>
  return (
    <ul className="divide-y divide-line">
      {rows.slice(0, limit).map((row) => {
        const { point, risk, need } = row
        return (
          <li key={point.id} className="flex items-stretch gap-3 py-2.5">
            <span aria-hidden className="w-1.5 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[risk.level] }} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{pointName(point, lang) || t.map.who}</span>
                <span className="text-sm font-semibold" style={{ color: LEVEL_TEXT[risk.level] }}>
                  {t.level[risk.level]}
                </span>
                {row.debt > 0 && (
                  <span className="ml-auto rounded-full bg-mist px-2 py-0.5 text-xs font-bold tabular" title={t.who.debtD}>
                    {f(t.who.debt, { n: row.debt })}
                  </span>
                )}
              </div>
              <Src kind="estimated">
                <span className="text-sm text-muted">{people(point)}</span>
              </Src>
              {row.protection.items.length > 0 && (
                <div>
                  <ProtectionLine row={row} />
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm">
                <span className="font-semibold">{t.topNeed[need]}</span>
                {risk.fire && risk.fire !== 'low' && (
                  <span className="flex items-center gap-1 font-semibold" style={{ color: risk.fire === 'high' ? LEVEL_TEXT[3] : LEVEL_TEXT[2] }}>
                    <Flame className="size-4" {...ICON} aria-hidden /> {f(t.who.fire, { level: t.who.fireLevel[risk.fire] })}
                  </span>
                )}
              </div>
            </div>
            {plan && need !== 'none' && (
              <Link to={to('/schemes', { point: point.id })} className="btn btn-line btn-sm self-center">
                {t.who.planHelp}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ---------- fire risk tonight: every part on screen ----------

export function FireParts({ b }: { b: Burning }) {
  const { t, f } = useI18n()
  const color = b.level === 'high' ? LEVEL_COLOR[3] : b.level === 'medium' ? LEVEL_COLOR[2] : '#9aa6ae'
  const parts: (keyof Burning['parts'])[] = ['cold', 'still', 'people', 'noHeat']
  if (b.parts.reports > 0) parts.push('reports')
  return (
    <div>
      <p className="font-semibold" style={{ color: b.level === 'low' ? undefined : LEVEL_TEXT[b.level === 'high' ? 3 : 2] }}>
        <Flame className="mr-1 inline size-4" {...ICON} aria-hidden />
        {f(t.fire.score, { level: t.who.fireLevel[b.level], score: b.score })}
      </p>
      <ul className="mt-1 space-y-1">
        {parts.map((k) => (
          <li key={k} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-xs">
            <span>{t.fire.parts[k]}</span>
            <span className="h-2 overflow-hidden rounded-full bg-mist">
              <span className="block h-full rounded-full" style={{ width: pct(k === 'reports' ? b.parts.reports / 0.2 : b.parts[k]), background: color }} />
            </span>
            <span className="text-right tabular">{pct(k === 'reports' ? b.parts.reports / 0.2 : b.parts[k])}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted">{t.fire.note}</p>
    </div>
  )
}

// ---------- check history for one point ----------

/** Timestamp of tonight or tomorrow night if it is cold ("Get ready" or worse), for re-checks. */
export function useColdNightAt(): number | null {
  const { wx, replay } = useApp()
  return useMemo(() => {
    if (!wx || replay) return null
    const days = wx.data.days
    for (let i = 0; i < Math.min(2, days.length); i++)
      if (Math.max(0, ...nightHours(days[i], days[i + 1]).map((h) => coldLevel(h.feels))) >= 2) return Date.parse(`${days[i].date}T20:00:00+05:30`)
    return null
  }, [wx, replay])
}

export function useCheckLine() {
  const { t, f, lang } = useI18n()
  return (c: Check) => {
    const signal = t.tasks.signals[c.signal]
    if (!c.ok) return f(t.state.notRunning, { signal, reason: c.reason ? t.checks.reasons[c.reason] : '?' })
    return c.ranFrom != null ? f(t.state.ranFrom, { signal, time: hourLabel(c.ranFrom, lang) }) : f(t.state.running, { signal })
  }
}

export function StateLine({ st }: { st: TaskState }) {
  const { t, f, lang } = useI18n()
  const now = useNow(60_000).getTime()
  const when = st.due != null ? clockDate(new Date(st.due), lang) : ''
  const color = st.status === 'fresh' ? '#157a45' : st.status === 'stopped' ? LEVEL_TEXT[3] : st.status === 'recheck' || st.status === 'unknown' ? LEVEL_TEXT[2] : undefined
  return (
    <span className="text-sm">
      <b style={{ color }}>{t.state[st.status]}</b>
      {st.why && st.due != null && (
        <span className="text-muted">
          {' · '}
          {st.due <= now ? f(t.state.now, { why: t.state.why[st.why] }) : f(t.state.next, { when, why: t.state.why[st.why] })}
        </span>
      )}
    </span>
  )
}

export function HistoryList({ pointId }: { pointId: string }) {
  const { t, lang } = useI18n()
  const help = useHelp()
  const line = useCheckLine()
  const coldNightAt = useColdNightAt()
  const now = useNow(60_000).getTime()
  const tasks = help.tasks.filter((x) => x.pointId === pointId && x.status !== 'planned')
  if (!tasks.length) return null
  const ids = new Set(tasks.map((x) => x.id))
  const items: { at: number; text: string; bad?: boolean }[] = []
  for (const x of tasks) if (x.deliveredAt) items.push({ at: x.deliveredAt, text: `${t.state.ev.delivered}: ${t.schemes.names[x.help]}` })
  for (const c of help.checks) if (ids.has(c.taskId)) items.push({ at: c.at, text: line(c), bad: !c.ok })
  for (const e of help.events) if (ids.has(e.taskId)) items.push({ at: e.at, text: t.state.ev[e.kind] })
  for (const fr of help.fires) if (fr.pointId === pointId) items.push({ at: fr.at, text: t.fire.report, bad: true })
  items.sort((a, b) => a.at - b.at)
  const latest = [...tasks].sort((a, b) => (b.deliveredAt ?? 0) - (a.deliveredAt ?? 0))[0]
  const st = taskState(latest, help.checks, help.fires, now, { coldNightAt })
  const demo = tasks.every((x) => x.demo)
  return (
    <div>
      <dt className="flex items-center gap-2 font-semibold text-muted">
        {t.state.history} {demo && <DemoTag label={t.state.demoHistory} />}
      </dt>
      <dd>
        <StateLine st={st} />
        <ol className="mt-1 space-y-0.5 border-l-2 border-line pl-3 text-xs">
          {items.slice(-8).map((it, i) => (
            <li key={i} className={it.bad ? 'font-semibold text-[#fca5a5]' : ''}>
              <span className="tabular text-muted">{new Date(it.at).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span> {it.text}
            </li>
          ))}
        </ol>
      </dd>
    </div>
  )
}

// ---------- needs today ----------

export function NeedsCards({ modes, max = 5, big, needs: given }: { modes: Mode[]; max?: number; big?: boolean; needs?: Need[] }) {
  const { t } = useI18n()
  const needs = (given ?? needsFor(modes)).slice(0, max)
  return (
    <ul className={big ? 'grid gap-3 sm:grid-cols-2' : 'space-y-2'}>
      {needs.map((n) => {
        const I = NEED_ICON[n]
        const [title, line] = t.needs.items[n]
        return (
          <li key={n} className={`flex gap-3 rounded-lg border border-line ${big ? 'p-4' : 'p-3'}`}>
            <I className={`${big ? 'size-7' : 'size-5'} shrink-0 text-ink`} {...ICON} aria-hidden />
            <div>
              <div className={`font-semibold ${big ? 'text-lg' : ''}`}>{title}</div>
              <p className="text-sm text-muted">{line}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ---------- did the help work? ----------

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="num text-lg font-bold">{value}</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-mist">
        <div className="h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
    </div>
  )
}

/** A 0-100% scale with an optional range band. */
function RateBar({ label, mean, lo, hi, color }: { label: string; mean: number; lo?: number; hi?: number; color: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_2.75rem] items-center gap-2 text-xs">
      <span className="font-semibold">{label}</span>
      <span className="relative h-3 rounded-full bg-mist">
        {lo != null && hi != null && (
          <span className="absolute inset-y-0 rounded-full opacity-35" style={{ left: pct(lo), width: `${(hi - lo) * 100}%`, background: color }} />
        )}
        <span className="absolute -inset-y-0.5 w-1 rounded-full" style={{ left: `calc(${pct(mean)} - 2px)`, background: color }} />
      </span>
      <span className="text-right text-sm font-bold tabular">{pct(mean)}</span>
    </div>
  )
}

export function ChecksPanel({ full }: { full?: boolean }) {
  const { t, f, lang } = useI18n()
  const help = useHelp()
  const { tasks, checks, learning: L } = help
  const trend = useMemo(() => monthlyTrend(tasks, checks), [tasks, checks])
  const reasons = useMemo(() => reasonCounts(tasks, checks), [tasks, checks])
  const latestOk = useMemo(() => {
    const last = new Map<string, Check>()
    for (const c of [...checks].sort((a, b) => a.at - b.at)) last.set(c.taskId, c)
    return [...last.values()].filter((c) => c.ok).length
  }, [checks])
  const delivered = tasks.filter((x) => x.status !== 'planned').length
  if (!delivered) return <p className="text-sm text-muted">{t.checks.empty}</p>
  const maxReason = Math.max(1, ...FAIL_REASONS.map((r) => reasons[r]))
  const monthName = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const localChecks = help.checks.filter((c) => !c.demo).length
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Bar label={t.checks.delivered} value={delivered} max={delivered} color="#93a4c3" />
        <Bar label={t.checks.confirmed} value={latestOk} max={delivered} color={LEVEL_COLOR[0]} />
      </div>

      <div className={full ? 'grid gap-6 md:grid-cols-2' : 'grid gap-5 sm:grid-cols-2'}>
        <div className="space-y-2">
          <p className="text-sm">
            {f(t.checks.learning, {
              before: pct(L.prior), after: pct(L.calls.mean), n: L.calls.n, lo: Math.round(L.calls.lo * 100), hi: Math.round(L.calls.hi * 100),
            })}
          </p>
          <RateBar label={t.checks.before} mean={L.prior} color="#9aa6ae" />
          <RateBar label={t.checks.after} mean={L.calls.mean} lo={L.calls.lo} hi={L.calls.hi} color="#1E9E5A" />
          {L.visits.n > 0 && <RateBar label={t.checks.adjusted} mean={L.adjusted.mean} lo={L.adjusted.lo} hi={L.adjusted.hi} color="#157a45" />}
          <p className="text-sm">
            {L.visits.n >= 5
              ? f(t.checks.visits, {
                  agreed: L.visits.agreed, n: L.visits.n, trust: L.trust.toFixed(1), adj: pct(L.adjusted.mean),
                  lo: Math.round(L.adjusted.lo * 100), hi: Math.round(L.adjusted.hi * 100),
                })
              : t.checks.noVisits}
          </p>
          <p className="text-sm font-semibold">{t.checks.lesson}</p>
        </div>

        <div className="space-y-4">
          {trend.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">{t.checks.trend}</h3>
              <ul className="space-y-1.5">
                {trend.map((m) => (
                  <li key={m.month}>
                    <RateBar label={monthName(m.month)} mean={m.belief.mean} lo={m.belief.lo} hi={m.belief.hi} color="#3D6FD9" />
                    <span className="ml-[7rem] text-xs text-muted">{f(t.checks.trendRow, { yes: m.yes, n: m.n })}</span>
                  </li>
                ))}
              </ul>
              {trend.length > 1 && trend[trend.length - 1].belief.mean < trend[trend.length - 2].belief.mean - 0.05 && (
                <p className="mt-1 text-sm font-semibold">{t.checks.trendNote}</p>
              )}
            </div>
          )}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">{t.checks.why}</h3>
            <ul className="space-y-1.5">
              {FAIL_REASONS.filter((r) => full || reasons[r] > 0).map((r) => (
                <li key={r} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2 text-sm">
                  <span>{t.checks.reasons[r]}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-mist">
                    <span className="block h-full rounded-full bg-[#F07F13]" style={{ width: `${(reasons[r] / maxReason) * 100}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular">{reasons[r]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {full && (
        <div className="space-y-1 rounded-lg bg-mist p-3 text-sm">
          <p>{t.checks.expiry}</p>
          <p className="text-muted">{t.checks.honest}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {help.demo && <DemoTag />}
        {localChecks > 0 && <span>{f(t.checks.localNote, { n: localChecks })}</span>}
      </div>
    </div>
  )
}

// ---------- protected hours ----------

export function PehBlock({ title, p, big, demo }: { title: string; p: ReturnType<typeof peh>; big?: boolean; demo?: boolean }) {
  const { t } = useI18n()
  const n = (v: number) => Math.round(v).toLocaleString('en-IN')
  const total = Math.max(1, p.estimated)
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted">
        {title} {demo && <DemoTag />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-semibold text-muted">{t.hours.estimated}</div>
          <Src kind="estimated">
            <span className={`num font-bold ${big ? 'text-6xl' : 'text-3xl'}`}>{n(p.estimated)}</span>
          </Src>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted">{t.hours.confirmed}</div>
          <span className={`num font-bold ${big ? 'text-6xl' : 'text-3xl'}`} style={{ color: '#157a45' }}>
            {n(p.confirmed)}
          </span>
        </div>
      </div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-mist" aria-hidden>
        <span style={{ width: `${(p.confirmed / total) * 100}%`, background: '#1E9E5A' }} />
        <span style={{ width: `${(p.failed / total) * 100}%`, background: '#D7263D' }} />
        <span style={{ width: `${(p.unknown / total) * 100}%`, background: '#c3cbd1' }} />
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-3 text-xs">
        <li>
          <span className="mr-1 inline-block size-2 rounded-full bg-[#1E9E5A]" aria-hidden />
          {t.hours.confirmed} {n(p.confirmed)}
        </li>
        <li>
          <span className="mr-1 inline-block size-2 rounded-full bg-[#D7263D]" aria-hidden />
          {t.hours.failed} {n(p.failed)}
        </li>
        <li>
          <span className="mr-1 inline-block size-2 rounded-full bg-[#c3cbd1]" aria-hidden />
          {t.hours.unknown} {n(p.unknown)}
        </li>
      </ul>
      <p className="mt-1 text-xs text-muted">{t.hours.unit}</p>
    </div>
  )
}

/** Winter 2025-26 (demo) and help from this device, Estimated and Confirmed side by side. */
export function HoursPanel({ big }: { big?: boolean }) {
  const { t } = useI18n()
  const help = useHelp()
  const now = useNow(60_000).getTime()
  const season = useMemo(() => {
    const demo = help.tasks.filter((x) => x.demo)
    return demo.length ? peh(demo, help.checks, Date.parse('2025-12-01T00:00:00+05:30'), Date.parse('2026-02-01T00:00:00+05:30')) : null
  }, [help])
  const local = useMemo(() => {
    const mine = help.local.filter((x) => x.deliveredAt != null)
    if (!mine.length) return null
    const from = startOfDay(Math.min(...mine.map((x) => x.deliveredAt!)))
    return peh(mine, help.checks, from, startOfDay(now) + DAY)
  }, [help, now])
  if (!season && !local) return <p className="text-sm text-muted">{t.checks.empty}</p>
  return (
    <div className="space-y-4">
      {season && <PehBlock title={t.hours.season} p={season} big={big} demo />}
      {local && <PehBlock title={t.hours.local} p={local} big={big} />}
      {big && <p className="max-w-prose text-sm text-muted">{t.hours.note}</p>}
    </div>
  )
}

// ---------- checks due (partner and officer) ----------

export function DueList({ tasks }: { tasks: Task[] }) {
  const { t, lang } = useI18n()
  const help = useHelp()
  const coldNightAt = useColdNightAt()
  const now = useNow(60_000).getTime()
  const sampleRate = help.learning.adjusted.n >= 30 && help.learning.adjusted.lo >= 0.85 ? 0.25 : 1
  const due = tasks
    .map((x) => ({ x, st: taskState(x, help.checks, help.fires, now, { coldNightAt, sampleRate }) }))
    .filter(({ st }) => st.due != null && st.due <= now + DAY && st.status !== 'planned')
    .sort((a, b) => (a.st.due ?? 0) - (b.st.due ?? 0))
  return (
    <div>
      {sampleRate < 1 && <p className="mb-2 text-sm text-muted">{t.checks.sample}</p>}
      {!due.length ? (
        <p className="text-sm text-muted">{t.checks.noneDue}</p>
      ) : (
        <ul className="divide-y divide-line">
          {due.map(({ x, st }) => (
            <li key={x.id} className="py-2">
              <div className="font-semibold">
                {t.schemes.names[x.help]} · {lang === 'hi' ? x.pointNameHi || x.pointName : x.pointName}
              </div>
              <StateLine st={st} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PanelBox({
  title, right, children, className, sub, emoji,
}: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string; sub?: React.ReactNode; emoji?: EmojiName }) {
  return (
    <section className={`panel p-4 sm:p-5 ${className ?? ''}`}>
      <SectionHead right={right} sub={sub} emoji={emoji}>
        {title}
      </SectionHead>
      {children}
    </section>
  )
}

