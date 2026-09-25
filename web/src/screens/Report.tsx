import { Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { monthOf, monthlyTrend, peh, reasonCounts } from '../lib/checks'
import { FAIL_REASONS, type Check } from '../lib/tasks'
import { DemoTag, ICON } from '../ui/atoms'
import { useNow } from '../ui/Header'
import { PanelBox, PehBlock } from './panels'
import { pct, useHelp, useRows } from './shared'

const monthStart = (m: string) => Date.parse(`${m}-01T00:00:00+05:30`)
const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}

function Reasons({ counts }: { counts: ReturnType<typeof reasonCounts> }) {
  const { t } = useI18n()
  const rows = FAIL_REASONS.filter((r) => counts[r] > 0).sort((a, b) => counts[b] - counts[a])
  if (!rows.length) return <p className="text-sm text-muted">-</p>
  const max = Math.max(...rows.map((r) => counts[r]))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2 text-sm">
          <span>{t.checks.reasons[r]}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-mist">
            <span className="block h-full rounded-full bg-[#F07F13]" style={{ width: `${(counts[r] / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular">{counts[r]}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Report() {
  const { t, f, lang } = useI18n()
  const { profile } = useApp()
  const help = useHelp()
  const rows = useRows()
  const [tab, setTab] = useState<'monthly' | 'csr'>(profile?.orgType === 'csr' ? 'csr' : 'monthly')
  const months = useMemo(() => {
    const s = new Set<string>(help.checks.map((c) => monthOf(c.at)))
    for (const x of help.tasks) if (x.deliveredAt) s.add(monthOf(x.deliveredAt))
    return [...s].sort()
  }, [help])
  const [pick, setPick] = useState<string | null>(null)
  const today = useNow(60_000)
  const month = pick ?? months[months.length - 1] ?? monthOf(today.getTime())
  const monthName = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const monthly = useMemo(() => {
    const from = monthStart(month)
    const to = monthStart(nextMonth(month))
    const inMonth = help.checks.filter((c) => c.at >= from && c.at < to)
    const latest = new Map<string, Check>()
    for (const c of [...inMonth].sort((a, b) => a.at - b.at)) latest.set(c.taskId, c)
    const vals = [...latest.values()]
    return {
      peh: peh(help.tasks, help.checks, from, to),
      checked: vals.length,
      working: vals.filter((c) => c.ok).length,
      reasons: reasonCounts(help.tasks, help.checks, from, to),
      trend: monthlyTrend(help.tasks, help.checks).find((x) => x.month === month),
    }
  }, [help, month])

  const csr = useMemo(() => {
    const heaters = help.tasks.filter((x) => (x.help === 'heater' || x.help === 'socket_fix') && x.status !== 'planned')
    const by = new Map<string, Check[]>()
    for (const c of help.checks) by.set(c.taskId, [...(by.get(c.taskId) ?? []), c])
    const risky = new Set(rows.filter((r) => r.risk.burning && r.risk.burning.level !== 'low').map((r) => r.point.id))
    let ok = 0
    let fail = 0
    let never = 0
    let priority = 0
    for (const h of heaters) {
      const cs = (by.get(h.id) ?? []).sort((a, b) => a.at - b.at)
      if (cs.some((c) => c.ok)) ok++
      if (!cs.length) never++
      else if (!cs[cs.length - 1].ok) fail++
      if (help.priority.has(h.id) || risky.has(h.pointId)) priority++
    }
    return { n: heaters.length, ok, fail, never, priority, reasons: reasonCounts(heaters, help.checks) }
  }, [help, rows])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-bold">{t.report.title}</h1>
        <div className="no-print flex flex-wrap items-center gap-2">
          <div role="tablist" className="inline-flex rounded-full border border-line bg-paper p-0.5">
            {(['monthly', 'csr'] as const).map((k) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === k ? 'bg-ink text-white' : ''}`}
              >
                {t.report[k]}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-line btn-sm" onClick={() => window.print()}>
            <Printer className="size-4" {...ICON} aria-hidden /> {t.report.print}
          </button>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {help.demo && <DemoTag />} {t.report.demo}
        {profile?.orgName && <span className="font-semibold text-ink">{f(t.report.org, { org: profile.orgName })}</span>}
      </p>

      {tab === 'monthly' ? (
        <>
          <label className="no-print flex items-center gap-2">
            <span className="label !mb-0">{t.report.month}</span>
            <select className="field !w-auto !min-h-9 !py-1" value={month} onChange={(e) => setPick(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </label>
          <h2 className="font-display text-2xl font-bold">
            {t.report.monthly}: {monthName(month)}
          </h2>
          {!monthly.peh.estimated && !monthly.checked ? (
            <p className="text-muted">{t.report.none}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <PanelBox title={t.report.peh}>
                <PehBlock title={monthName(month)} p={monthly.peh} />
                <p className="mt-2 text-xs text-muted">{t.hours.note}</p>
              </PanelBox>
              <PanelBox title={t.report.help}>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                  <dt>{t.report.checked}</dt>
                  <dd className="num text-2xl font-bold">{monthly.checked}</dd>
                  <dt>{t.report.working}</dt>
                  <dd className="num text-2xl font-bold text-[#157a45]">{monthly.working}</dd>
                  <dt>{t.report.notWorking}</dt>
                  <dd className="num text-2xl font-bold text-[#b01f33]">{monthly.checked - monthly.working}</dd>
                  {monthly.trend && (
                    <>
                      <dt>{t.report.rate}</dt>
                      <dd className="text-right font-bold tabular">
                        {pct(monthly.trend.belief.mean)}{' '}
                        <span className="text-xs font-normal text-muted">
                          ({Math.round(monthly.trend.belief.lo * 100)}-{Math.round(monthly.trend.belief.hi * 100)}%)
                        </span>
                      </dd>
                    </>
                  )}
                </dl>
                <h3 className="mt-4 mb-2 text-sm font-semibold text-muted">{t.report.why}</h3>
                <Reasons counts={monthly.reasons} />
              </PanelBox>
            </div>
          )}
          <p className="font-semibold">{t.checks.lesson}</p>
        </>
      ) : (
        <>
          <h2 className="font-display text-2xl font-bold">{t.report.csr}</h2>
          {!csr.n ? (
            <p className="text-muted">{t.report.none}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <PanelBox title={f(t.report.csrLine, { n: csr.n })}>
                <ul className="space-y-2 text-lg">
                  <li>
                    <b className="num text-3xl text-[#157a45]">{csr.ok}</b> {f(t.report.csrOk, { n: '' }).trim()}
                  </li>
                  <li>
                    <b className="num text-3xl">{csr.priority}</b> {f(t.report.csrPriority, { n: '' }).trim()}
                  </li>
                  <li>
                    <b className="num text-3xl text-[#b01f33]">{csr.fail}</b> {f(t.report.csrFail, { n: '' }).trim()}
                  </li>
                  <li>
                    <b className="num text-3xl text-muted">{csr.never}</b> {f(t.report.csrUnchecked, { n: '' }).trim()}
                  </li>
                </ul>
              </PanelBox>
              <PanelBox title={t.report.why}>
                <Reasons counts={csr.reasons} />
                <p className="mt-3 font-semibold">{t.report.csrNext}</p>
                <p className="mt-1 text-sm">{t.checks.lesson}</p>
              </PanelBox>
            </div>
          )}
        </>
      )}
    </div>
  )
}
