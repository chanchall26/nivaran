import { CheckCircle2, Clock, EyeOff, MapPin, RotateCcw, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Btn, SectionTitle } from '../components/kit'
import { useI18n } from '../i18n'
import { cellLabel } from '../lib/format'
import { store } from '../lib/store'
import type { Report } from '../lib/types'
import { useApp } from '../state'

type Filter = 'open' | 'assigned' | 'resolved' | 'all'

export function useAgo() {
  const { s, f } = useI18n()
  return (ms: number) => {
    const m = Math.max(1, Math.round(ms / 60000))
    const t = m < 60 ? f(s.inbox.min, { n: m }) : m < 60 * 48 ? f(s.inbox.hours, { n: Math.round(m / 60) }) : f(s.inbox.days, { n: Math.round(m / 1440) })
    return t
  }
}

const STATUS_STYLE: Record<Report['status'], string> = {
  open: 'bg-critical text-white',
  assigned: 'bg-warning text-[#2b1608]',
  resolved: 'bg-good text-white',
}

export default function Inbox() {
  const { city, reports, season } = useApp()
  const { s, f, lang } = useI18n()
  const ago = useAgo()
  const [filter, setFilter] = useState<Filter>('open')
  const [onlySeason, setOnlySeason] = useState(true)
  const byH3 = useMemo(() => new Map((city?.cells ?? []).map((c) => [c.h3, c])), [city])
  // rendering reads the clock; captured once per render pass is fine for "x min ago"
  const [now] = useState(() => Date.now())

  const counts = useMemo(() => {
    const base = reports.filter((r) => !onlySeason || r.season === season)
    return {
      open: base.filter((r) => r.status === 'open').length,
      assigned: base.filter((r) => r.status === 'assigned').length,
      resolved: base.filter((r) => r.status === 'resolved').length,
      all: base.length,
    }
  }, [reports, onlySeason, season])

  const list = useMemo(
    () =>
      reports
        .filter((r) => !onlySeason || r.season === season)
        .filter((r) => filter === 'all' || r.status === filter)
        .sort((a, b) => b.createdAt - a.createdAt),
    [reports, filter, onlySeason, season],
  )

  const setStatus = (r: Report, status: Report['status']) =>
    store.update('reports', r.id, { status, resolvedAt: status === 'resolved' ? Date.now() : undefined })

  const tabs: [Filter, string][] = [
    ['open', s.inbox.open],
    ['assigned', s.inbox.assigned],
    ['resolved', s.inbox.resolved],
    ['all', s.inbox.all],
  ]

  return (
    <div className="space-y-6">
      <SectionTitle sub={s.inbox.intro}>{s.inbox.title}</SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2 font-display font-bold transition-all ${
              filter === k ? 'border-transparent bg-ink text-bg shadow-[0_4px_0_rgb(var(--shade)/0.4)]' : 'border-line bg-surface text-ink-2 shadow-[0_4px_0_var(--line)]'
            }`}
          >
            {label}
            <span className={`rounded-full px-2 text-xs tabular ${filter === k ? 'bg-bg text-ink' : 'bg-surface-2'}`}>{counts[k]}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-ink-2">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={onlySeason} onChange={(e) => setOnlySeason(e.target.checked)} />
          {s.inbox.thisSeason}
        </label>
      </div>

      {!list.length ? (
        <div className="surface-3d p-10 text-center text-ink-3">{s.inbox.empty}</div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((r) => {
            const cell = byH3.get(r.h3)
            const summary = (lang === 'hi' ? r.summaryHi : r.summary) || ''
            return (
              <li key={r.id} className="surface-3d anim-rise flex gap-4 overflow-hidden p-4">
                <div className="relative size-28 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
                  {r.thumb ? (
                    <img src={r.thumb} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 text-xs text-ink-3">
                      <EyeOff className="size-6" aria-hidden /> {s.inbox.noPhoto}
                    </div>
                  )}
                  <span className={`absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status]}`}>
                    {r.status === 'open' ? s.inbox.open : r.status === 'assigned' ? s.inbox.assigned : s.inbox.resolved}
                  </span>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="font-display text-lg leading-tight font-extrabold">{s.cat[r.category]}</div>
                  {summary && <p className="text-sm text-ink-2">{summary}</p>}
                  <p className="flex items-center gap-1 text-xs text-ink-3">
                    <MapPin className="size-3.5" aria-hidden /> {cell ? cellLabel(cell, s, lang) : `${r.lat}, ${r.lon}`}
                    <span className="mx-1">·</span>
                    <Clock className="size-3.5" aria-hidden /> {f(s.inbox.ago, { t: ago(now - r.createdAt) })}
                    {r.demo && <span className="ml-1 rounded border border-dashed border-ink-3 px-1">{s.inbox.sample}</span>}
                  </p>
                  <p className="text-xs font-semibold text-accent">{s.route[r.route]}</p>
                  {r.note && (
                    <p className="text-xs text-ink-2">
                      <b>{s.inbox.note}:</b> {r.note}
                    </p>
                  )}
                  {r.status === 'resolved' && r.resolvedAt && (
                    <p className="text-xs font-semibold text-good">{f(s.inbox.helpIn, { t: ago(r.resolvedAt - r.createdAt) })}</p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.status === 'open' && (
                      <Btn size="sm" variant="soft" onClick={() => setStatus(r, 'assigned')}>
                        <UserCheck className="size-4" /> {s.inbox.assign}
                      </Btn>
                    )}
                    {r.status !== 'resolved' && (
                      <Btn size="sm" onClick={() => setStatus(r, 'resolved')}>
                        <CheckCircle2 className="size-4" /> {s.inbox.resolve}
                      </Btn>
                    )}
                    {r.status === 'resolved' && (
                      <Btn size="sm" variant="soft" onClick={() => setStatus(r, 'open')}>
                        <RotateCcw className="size-4" /> {s.inbox.reopen}
                      </Btn>
                    )}
                    <Link to={`/map?h3=${r.h3}`} className="btn-3d btn-soft px-3.5 py-2 text-sm">
                      <MapPin className="size-4" /> {s.inbox.onMap}
                    </Link>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
