import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Panel, SectionTitle } from '../components/kit'
import { useI18n } from '../i18n'
import { budgetShift, OPTIONS, planBudget, type NodeContext, type OptionKind } from '../lib/budget'
import { belief, learnFromPulses, MIN_SAMPLE, PRIORS, type Belief, type MemoryKey } from '../lib/memory'
import { burningRisk, nightAsWeather, type ExposureNode, type NightRow } from '../lib/nodes'
import { simulateWinter, type ReplayEvent, type ReplayNight } from '../lib/replay'
import { useNodes } from '../lib/useNodes'
import { useApp } from '../state'

const BUDGET = 100000
const pct = (x: number) => `${Math.round(x * 100)}%`

/** Planner inputs for the demo nodes on one replay night. Shyam's gate follows his story. */
function contextsFor(nodes: ExposureNode[], night: NightRow, heaterRate: number, shyam: 'unconfirmed' | 'failed_fixable' | 'working'): NodeContext[] {
  return nodes.map((n) => {
    const heater: NodeContext['heater'] = n.id === 'shyam-gate' ? shyam : n.winter.heater === 'distributed' ? 'unconfirmed' : 'none'
    const st = heater === 'failed_fixable' ? 'failed' : heater === 'working' ? 'working' : heater === 'unconfirmed' ? 'distributed' : 'none'
    return { node: n, heater, hazard: burningRisk(n, nightAsWeather(night), { heater: st, warmKits: 0, fireReports: 0 }, heaterRate).score / 100 }
  })
}

function BeliefCard({ b, title }: { b: Belief; title: string }) {
  const { s, f } = useI18n()
  return (
    <div className="surface-3d p-5">
      <div className="text-sm font-bold text-ink-2">{title}</div>
      <div className="mt-1 flex items-end gap-3">
        <span className="font-display text-6xl leading-none font-extrabold tabular">{pct(b.mean)}</span>
        <span className="pb-1 text-sm text-ink-3 line-through">{pct(b.priorMean)}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{f(s.proof.beliefSub, { n: b.n, lo: pct(b.lo), hi: pct(b.hi) })}</p>
      {/* 0-100% track: band = 90% range, tick = file assumption */}
      <div className="relative mt-4 h-4 rounded-full bg-surface-2" role="img" aria-label={`${pct(b.lo)}-${pct(b.hi)}`}>
        <div className="absolute inset-y-0 rounded-full bg-cool/40 transition-all duration-500" style={{ left: pct(b.lo), width: `${(b.hi - b.lo) * 100}%` }} />
        <div className="absolute inset-y-[-3px] w-1 rounded bg-cool transition-all duration-500" style={{ left: `calc(${pct(b.mean)} - 2px)` }} />
        <div className="absolute inset-y-[-6px] w-0.5 bg-ink-3" style={{ left: pct(b.priorMean) }} title={f(s.proof.assumed, { p: pct(b.priorMean) })} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>0%</span><span>{f(s.proof.assumed, { p: pct(b.priorMean) })}</span><span>100%</span></div>
      <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${b.sufficient ? 'bg-good/15 text-good' : 'bg-surface-2 text-ink-2'}`}>
        {b.sufficient ? s.proof.switched : f(s.proof.waiting, { n: MIN_SAMPLE })}
      </p>
    </div>
  )
}

/** Two cumulative lines: estimated (file) and verified (Pulse). */
function Scoreboard({ nights, idx }: { nights: ReplayNight[]; idx: number }) {
  const { s, num } = useI18n()
  const W = 600
  const H = 170
  // scale to tonight so the lines fill the chart as the winter goes on
  const max = Math.max(1, nights[idx].estimatedTotal * 1.1)
  const x = (i: number) => (i / Math.max(1, idx)) * W
  const y = (v: number) => H - (v / max) * (H - 10)
  const path = (key: 'estimatedTotal' | 'verifiedTotal') =>
    nights.slice(0, idx + 1).map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(n[key]).toFixed(1)}`).join(' ')
  const cur = nights[idx]
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {[
          [s.proof.estimated, cur.estimatedTotal, 'var(--ink-3)'],
          [s.proof.verified, cur.verifiedTotal, 'var(--cool)'],
          [s.proof.gap, cur.estimatedTotal - cur.verifiedTotal, 'var(--color-critical)'],
        ].map(([label, v, c]) => (
          <div key={label as string} className="rounded-2xl bg-surface-2 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <span className="inline-block size-2.5 rounded-full" style={{ background: c as string }} /> {label as string}
            </div>
            <div className="mt-1 font-display text-2xl font-extrabold tabular">{num(Math.round(v as number))}</div>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={s.proof.score}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" />
        <path d={path('estimatedTotal')} fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="6 5" />
        <path d={path('verifiedTotal')} fill="none" stroke="var(--cool)" strokeWidth="3" />
      </svg>
    </div>
  )
}

export default function Proof() {
  const data = useNodes()
  const { deliveries, pulses } = useApp()
  const { s, f, lang, num } = useI18n()
  const [mode, setMode] = useState<'replay' | 'live'>('replay')
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)

  const replay = useMemo(() => (data ? simulateWinter(data.nights) : null), [data])
  const n = replay?.nights.length ?? 0

  useEffect(() => {
    if (!playing || !n) return
    const t = setInterval(() => setIdx((i) => {
      if (i >= n - 1) {
        setPlaying(false)
        return i
      }
      return i + 1
    }), 650)
    return () => clearInterval(t)
  }, [playing, n])

  // Shyam's gate across the replay: unknown -> "no socket" -> fixed and confirmed
  const shyamState = useMemo(() => {
    if (!replay) return [] as ('unconfirmed' | 'failed_fixable' | 'working')[]
    let st: 'unconfirmed' | 'failed_fixable' | 'working' = 'unconfirmed'
    return replay.nights.map((night) => {
      for (const e of night.events.filter((ev) => ev.shyam)) {
        if (e.kind === 'pulse' && !e.ok) st = 'failed_fixable'
        if (e.kind === 'recheck' && e.ok) st = 'working'
      }
      return st
    })
  }, [replay])

  // heaters Pulse has found unused for a reason a socket / bill permission fixes, up to tonight
  const knownFixable = useMemo(() => {
    if (!replay) return [] as number[]
    const seen = new Set<number>()
    return replay.nights.map((night) => {
      for (const e of night.events)
        if (e.kind === 'pulse' && !e.ok && (e.reason === 'no_socket' || e.reason === 'electricity_bill' || e.reason === 'rwa_refused')) seen.add(e.heater)
      return seen.size
    })
  }, [replay])

  const plans = useMemo(() => {
    if (!data || !replay) return null
    const night = replay.nights[idx]
    const row = data.nights[idx]
    const priorBeliefs = Object.fromEntries((Object.keys(PRIORS) as MemoryKey[]).map((k) => [k, belief(PRIORS[k], 0, 0)])) as Record<MemoryKey, Belief>
    const nowBeliefs = { ...priorBeliefs, heater: night.heater, socket_fix: night.socketFix }
    const before = planBudget({ season: 'sardi', budget: BUDGET, contexts: contextsFor(data.nodes, row, priorBeliefs.heater.planValue, 'unconfirmed'), beliefs: priorBeliefs })
    // once the plan uses what was learned, fixing the heaters already handed out comes first
    const fixSpend = night.switched ? Math.min(BUDGET, knownFixable[idx] * OPTIONS.socket_fix.unitCost) : 0
    const now = planBudget({ season: 'sardi', budget: BUDGET - fixSpend, contexts: contextsFor(data.nodes, row, night.planRate, shyamState[idx]), beliefs: nowBeliefs })
    if (fixSpend) {
      const k = (now.byKind.socket_fix ??= { units: 0, cost: 0 })
      k.units += fixSpend / OPTIONS.socket_fix.unitCost
      k.cost += fixSpend
    }
    return { shift: budgetShift(before, now), before, now }
  }, [data, replay, idx, shyamState, knownFixable])

  const live = useMemo(() => learnFromPulses(deliveries, pulses), [deliveries, pulses])

  if (!data || !replay || !plans) return <div className="p-16 text-center text-ink-3">{s.app.loading}</div>

  const night = replay.nights[idx]
  const recent = replay.nights.slice(Math.max(0, idx - 2), idx + 1).flatMap((nn) => nn.events.map((e) => ({ e, date: nn.date }))).reverse().slice(0, 7)
  const activeStep = night.events.some((e) => e.kind === 'switch') ? 4 : night.events.some((e) => e.kind === 'fix') ? 5 : night.events.some((e) => e.kind === 'pulse' || e.kind === 'recheck') ? 3 : 0
  const who = (e: ReplayEvent) => (e.shyam ? s.proof.shyam : f(s.proof.gate, { n: e.heater + 1 }))
  const evText = (e: ReplayEvent) => {
    if (e.kind === 'switch') return s.proof.evSwitch
    if (e.kind === 'fix') return f(s.proof.evFix, { who: who(e) })
    if (e.kind === 'recheck') return f(s.proof.evRecheck, { who: who(e), ans: e.ok ? s.proof.ran : s.proof.notRan })
    return e.ok ? f(s.proof.evPulseYes, { who: who(e) }) : f(s.proof.evPulseNo, { who: who(e), reason: s.reason[e.reason ?? 'other'] })
  }
  const dateLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })
  const maxSpend = Math.max(1, ...plans.shift.map((x) => Math.max(x.before, x.after)))

  return (
    <div className="space-y-6">
      <SectionTitle sub={s.proof.intro}>{s.proof.title}</SectionTitle>

      {/* the loop */}
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {s.proof.steps.map((step, i) => (
          <li key={step} className={`rounded-2xl border-2 px-3 py-2.5 text-center font-display text-sm font-extrabold transition-all ${
            mode === 'replay' && i === activeStep ? 'scale-105 border-accent bg-accent text-accent-ink shadow-[0_5px_0_var(--accent-edge)]'
              : i >= 3 ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface text-ink-2'}`}>
            <span className="mr-1 opacity-60">{i + 1}</span>{step}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {(['replay', 'live'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
            className={`rounded-full border px-4 py-2 font-bold ${mode === m ? 'border-transparent bg-ink text-bg shadow-[0_3px_0_rgb(var(--shade)/0.35)]' : 'border-line bg-surface text-ink-2'}`}>
            {m === 'replay' ? s.proof.replay : s.proof.live}
          </button>
        ))}
      </div>

      {mode === 'replay' ? (
        <>
          <Panel className="!p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => { if (idx >= n - 1) setIdx(0); setPlaying(!playing) }}
                className="btn-3d btn-primary px-5 py-3" aria-label={playing ? s.proof.pause : s.proof.play}>
                {playing ? <Pause className="size-5" /> : <Play className="size-5" />} {playing ? s.proof.pause : s.proof.play}
              </button>
              <button type="button" onClick={() => { setIdx(0); setPlaying(false) }} className="btn-3d btn-soft px-4 py-3" aria-label={s.proof.restart}>
                <RotateCcw className="size-5" />
              </button>
              <div className="min-w-[180px] flex-1">
                <div className="font-display text-lg font-extrabold">{f(s.proof.night, { d: dateLabel(night.date) })}</div>
                <div className="text-sm text-ink-2">{f(s.proof.feels, { t: night.minFeels.toFixed(1), v: num(night.vc) })}</div>
              </div>
              <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }}
                className="w-full accent-[var(--accent)] sm:w-72" aria-label={s.proof.night} />
            </div>
            <p className="mt-2 text-xs text-ink-3">{s.proof.replayNote}</p>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <BeliefCard b={night.heater} title={s.proof.belief} />
            <Panel>
              <h2 className="mb-2 font-display text-lg font-extrabold">{s.proof.feed}</h2>
              {recent.length ? (
                <ul className="space-y-1.5">
                  {recent.map(({ e, date }, i) => (
                    <li key={i} className={`flex gap-2 rounded-xl px-3 py-2 text-sm ${e.shyam ? 'bg-accent-soft font-semibold' : e.kind === 'switch' ? 'bg-good/15 font-semibold text-good' : 'bg-surface-2'}`}>
                      <span className="w-14 shrink-0 text-xs text-ink-3">{dateLabel(date)}</span>
                      <span>{evText(e)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-ink-3">{s.proof.noCalls}</p>}
              <p className="mt-3 text-xs text-ink-3">{f(s.proof.fixes, { n: night.fixesDone, k: night.kitsSent })}</p>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <h2 className="font-display text-lg font-extrabold">{f(s.proof.budget, { b: num(BUDGET) })}</h2>
              <p className="mb-3 text-sm text-ink-2">{s.proof.budgetSub}</p>
              <ul className="space-y-3">
                {plans.shift.map((x) => (
                  <li key={x.kind}>
                    <div className="flex justify-between text-sm font-bold">
                      <span>{s.opt[x.kind as OptionKind]}</span>
                      <span className="tabular">₹{num(x.before)} → <span className={x.after > x.before ? 'text-good' : x.after < x.before ? 'text-critical' : ''}>₹{num(x.after)}</span></span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      <div className="h-2 rounded-full bg-ink-3/40" style={{ width: `${(x.before / maxSpend) * 100}%` }} title={s.proof.before} />
                      <div className="h-2.5 rounded-full bg-accent transition-all duration-500" style={{ width: `${(x.after / maxSpend) * 100}%` }} title={s.proof.now} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-4 text-xs text-ink-3">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-5 rounded-full bg-ink-3/40" /> {s.proof.before}</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-5 rounded-full bg-accent" /> {s.proof.now}</span>
              </div>
            </Panel>
            <Panel>
              <h2 className="font-display text-lg font-extrabold">{s.proof.score}</h2>
              <p className="mb-3 text-sm text-ink-2">{s.proof.scoreSub}</p>
              <Scoreboard nights={replay.nights} idx={idx} />
            </Panel>
          </div>

          <MemoryTable rows={[
            { key: 'heater', b: night.heater },
            { key: 'socket_fix', b: night.socketFix },
          ]} />
        </>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink-2">{s.proof.liveNote}</p>
          {live.heater.n + live.warm_kit.n + live.shade_net.n + live.sapling.n === 0 ? (
            <Panel><p className="text-ink-2">{s.proof.nothingLive}</p></Panel>
          ) : (
            <>
              <div className="grid gap-5 lg:grid-cols-2">
                <BeliefCard b={live.heater} title={s.proof.belief} />
                <BeliefCard b={live.sapling} title={`${s.opt.sapling}: ${s.status.alive}`} />
              </div>
              <MemoryTable rows={(['heater', 'socket_fix', 'warm_kit', 'shade_net', 'water_pot', 'sapling'] as MemoryKey[]).map((k) => ({ key: k, b: live[k] }))} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MemoryTable({ rows }: { rows: { key: MemoryKey; b: Belief }[] }) {
  const { s } = useI18n()
  return (
    <Panel>
      <h2 className="font-display text-lg font-extrabold">{s.proof.memory}</h2>
      <p className="mb-3 text-sm text-ink-2">{s.proof.memorySub}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr>
              <th className="py-2 pr-3">{s.proof.colWhat}</th><th className="py-2 pr-3">{s.proof.colPredicted}</th>
              <th className="py-2 pr-3">{s.proof.colObserved}</th><th className="py-2 pr-3">{s.proof.colN}</th><th className="py-2">{s.proof.colLearn}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, b }) => {
              const learn = !b.sufficient ? s.proof.learnWait : b.mean < b.priorMean - 0.1 ? s.proof.learnDown : b.mean > b.priorMean + 0.05 ? s.proof.learnUp : s.proof.learnSame
              const label = key in OPTIONS ? s.opt[key as OptionKind] : s.item[key as keyof typeof s.item]
              return (
                <tr key={key} className="border-t border-line">
                  <td className="py-2.5 pr-3 font-bold">{label}</td>
                  <td className="py-2.5 pr-3 tabular">{pct(b.priorMean)}</td>
                  <td className="py-2.5 pr-3 tabular">{b.n ? `${pct(b.mean)} (${pct(b.lo)}-${pct(b.hi)})` : '—'}</td>
                  <td className="py-2.5 pr-3 tabular">{b.n}</td>
                  <td className="py-2.5 text-ink-2">{learn}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
