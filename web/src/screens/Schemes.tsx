import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { FILE_HEATER_RATE, HELP, HELP_ORDER, heaterValue, optionsFor, suggestPlan, type Plan } from '../lib/plan'
import { conditionOf, modesOf, type Mode } from '../lib/risk'
import { taskStore, useDb } from '../lib/tasks'
import { DemoTag, inr, Src } from '../ui/atoms'
import { PanelBox } from './panels'
import { heaterFor, pct, pointName, useHelp } from './shared'

type PlanFor = 'auto' | 'cold' | 'heat' | 'rain' | 'smoky'

export default function Schemes() {
  const { pts, wx, profile } = useApp()
  const { t, f, lang } = useI18n()
  const { tasks } = useDb()
  const help = useHelp()
  const [params] = useSearchParams()
  const only = params.get('point')
  const points = useMemo(() => pts.points ?? [], [pts.points])
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const chosen = picked ?? new Set(only && points.some((p) => p.id === only) ? [only] : points.map((p) => p.id))
  const [budget, setBudget] = useState<number>(profile?.budget ?? 200000)
  const [equal, setEqual] = useState(false)
  const [planFor, setPlanFor] = useState<PlanFor>('auto')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [applied, setApplied] = useState<number | null>(null)

  // modes the plan works for: this week's forecast, or a season picked to plan ahead
  const weekModes = useMemo(() => {
    const s = new Set<Mode>()
    wx?.data.days.forEach((d, i, all) => {
      modesOf(d).forEach((m) => s.add(m))
      // a hot afternoon ("Be careful") already calls for water and shade
      const { hz } = conditionOf(d, all[i + 1])
      if (hz.heat >= 1) s.add('heat')
      if (hz.air >= 2) s.add('smoky')
    })
    s.delete('mild')
    return [...s]
  }, [wx])
  const modes: Mode[] = planFor === 'auto' ? weekModes : planFor === 'heat' ? ['heat', 'humid'] : [planFor]

  const wards = useMemo(() => {
    const m = new Map<string, { label: string; ids: string[] }>()
    for (const p of points) {
      const k = p.ward || '-'
      if (!m.has(k)) m.set(k, { label: (lang === 'hi' ? p.wardHi : p.ward) || '-', ids: [] })
      m.get(k)!.ids.push(p.id)
    }
    return [...m.entries()]
  }, [points, lang])

  const toggle = (ids: string[]) => {
    const next = new Set(chosen)
    const all = ids.every((i) => next.has(i))
    ids.forEach((i) => (all ? next.delete(i) : next.add(i)))
    setPicked(next)
    setPlan(null)
  }

  const suggest = () => {
    const opts = points.filter((p) => chosen.has(p.id)).flatMap((p) => optionsFor(p, modes, heaterFor(p, help), help.heaterRate))
    setPlan(suggestPlan(opts, budget, equal))
    setApplied(null)
  }
  const apply = () => {
    if (!plan) return
    taskStore.addTasks(
      plan.picks.map((o) => ({
        pointId: o.point.id, pointName: o.point.name, pointNameHi: o.point.nameHi, lat: o.point.lat, lon: o.point.lon,
        help: o.help, qty: o.qty, cost: o.cost, people: o.people,
        shiftHours: o.help === 'shade_canopy' ? 4 : o.help === 'water_point' || o.help === 'masks' ? 8 : 12,
      })),
    )
    setApplied(plan.picks.length)
    setPlan(null)
  }

  const placeTasks = tasks.filter((x) => points.some((p) => p.id === x.pointId))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[28px] font-bold">{t.schemes.title}</h1>
        <p className="text-muted">{t.schemes.intro}</p>
      </div>

      {/* help types with demo costs */}
      <section className="panel overflow-x-auto p-4">
        <div className="mb-2 flex items-center gap-2">
          <DemoTag label={t.src.demoCost} />
        </div>
        <ul className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
          {HELP_ORDER.map((h) => (
            <li key={h} className="rounded-lg border border-line px-3 py-2">
              <div className="font-semibold">{t.schemes.names[h]}</div>
              <div className="text-sm">
                <Src kind="demoCost">
                  <b className="tabular">{inr(HELP[h].cost)}</b>
                </Src>{' '}
                <span className="text-muted">{t.schemes.per[HELP[h].per]}</span>
              </div>
              <div className="text-xs text-muted">{t.schemes.starts[HELP[h].starts]}</div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <PanelBox title={t.schemes.step1}>
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" className="chip !py-1" aria-pressed={chosen.size === points.length && points.length > 0} onClick={() => (setPicked(new Set(points.map((p) => p.id))), setPlan(null))}>
              {t.schemes.all}
            </button>
            {wards.map(([k, w]) => (
              <button key={k} type="button" className="chip !py-1" aria-pressed={w.ids.every((i) => chosen.has(i))} onClick={() => toggle(w.ids)}>
                {w.label}
              </button>
            ))}
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {points.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-mist">
                  <input type="checkbox" className="size-4 accent-[#1b2330]" checked={chosen.has(p.id)} onChange={() => toggle([p.id])} />
                  <span className="truncate text-sm">{pointName(p, lang)}</span>
                </label>
              </li>
            ))}
          </ul>
        </PanelBox>

        <PanelBox title={t.schemes.step2}>
          <label className="block">
            <span className="sr-only">{t.schemes.step2}</span>
            <input
              className="field num !text-3xl font-bold"
              inputMode="numeric"
              value={budget.toLocaleString('en-IN')}
              onChange={(e) => (setBudget(Number(e.target.value.replace(/\D/g, '')) || 0), setPlan(null))}
            />
          </label>
          <fieldset className="mt-4">
            <legend className="label">{t.schemes.planFor}</legend>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(t.schemes.planFors) as PlanFor[]).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={planFor === k} onClick={() => (setPlanFor(k), setPlan(null))}>
                  {t.schemes.planFors[k]}
                </button>
              ))}
            </div>
            {planFor === 'auto' && !weekModes.length && <p className="mt-2 text-sm font-semibold text-[#8a6d00]">{t.schemes.mildHint}</p>}
          </fieldset>
          <label className="mt-4 flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-1 size-4 accent-[#1b2330]" checked={equal} onChange={(e) => (setEqual(e.target.checked), setPlan(null))} />
            <span>
              <span className="font-semibold">{t.schemes.equal}</span>
              <span className="block text-sm text-muted">{t.schemes.equalD}</span>
            </span>
          </label>
          <button type="button" className="btn btn-ink mt-4 w-full" onClick={suggest} disabled={!chosen.size || !budget || !modes.length}>
            {t.schemes.suggest}
          </button>
        </PanelBox>
      </div>

      <PanelBox title={t.schemes.step3} right={<DemoTag label={t.src.demoCost} />}>
        {applied != null && <p className="mb-3 rounded-lg bg-[#e6f4ec] px-3 py-2 font-semibold text-[#14663b]" role="status">{f(t.schemes.applied, { n: applied })}</p>}
        {!plan ? (
          <p className="text-muted">{t.schemes.empty}</p>
        ) : !plan.picks.length ? (
          <p className="text-muted">{t.schemes.nothing}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-2 pr-3 font-semibold">{t.schemes.help}</th>
                    <th className="py-2 pr-3 font-semibold">{t.schemes.where}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t.schemes.qty}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t.schemes.cost}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t.schemes.people}</th>
                    <th className="py-2 text-right font-semibold">{t.schemes.hoursCol}</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {plan.picks.map((o, i) => (
                    <tr key={i} className="border-b border-line/60">
                      <td className="py-2 pr-3 font-semibold">{t.schemes.names[o.help]}</td>
                      <td className="py-2 pr-3">{pointName(o.point, lang)}</td>
                      <td className="py-2 pr-3 text-right">{o.qty}</td>
                      <td className="py-2 pr-3 text-right">{inr(o.cost)}</td>
                      <td className="py-2 pr-3 text-right">{o.people}</td>
                      <td className="py-2 text-right font-semibold">{o.hours.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="font-semibold">{f(t.schemes.spent, { spent: inr(plan.spent), budget: inr(budget) })}</span>
              <span className="font-semibold">{f(t.schemes.covered, { n: plan.people })}</span>
              <span className="text-sm text-muted">{t.schemes.treesNote}</span>
              <button type="button" className="btn btn-ink ml-auto" onClick={apply}>
                {t.schemes.apply}
              </button>
            </div>
          </>
        )}
      </PanelBox>

      {modes.includes('cold') && <ShiftPanel rate={help.heaterRate} />}

      {placeTasks.length > 0 && (
        <PanelBox title={t.schemes.progress}>
          <ul className="divide-y divide-line">
            {placeTasks.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="font-semibold">{t.schemes.names[x.help]}</span>
                <span className="text-muted">{lang === 'hi' ? x.pointNameHi || x.pointName : x.pointName}</span>
                <span className="ml-auto flex gap-1">
                  {(['planned', 'delivered', 'working'] as const).map((s, i) => {
                    const order = { planned: 0, delivered: 1, working: 2, failed: 2 }[x.status]
                    const done = order >= i
                    const failed = x.status === 'failed' && i === 2
                    return (
                      <span key={s} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${failed ? 'bg-[#D7263D] text-white' : done ? 'bg-ink text-white' : 'bg-mist text-muted'}`}>
                        {failed ? t.schemes.status.failed : t.schemes.status[s]}
                      </span>
                    )
                  })}
                </span>
              </li>
            ))}
          </ul>
        </PanelBox>
      )}
    </div>
  )
}

/** Why the plan changed: protected hours per ₹1,000 with the file's 9 in 10 vs what checks found. */
function ShiftPanel({ rate }: { rate: number }) {
  const { t, f } = useI18n()
  if (rate >= FILE_HEATER_RATE - 0.02) return null
  const before = heaterValue(FILE_HEATER_RATE)
  const after = heaterValue(rate)
  const rows = (['heater', 'warm_kit', 'socket_fix'] as const).map((k) => ({ k, before: before[k], after: after[k] }))
  const bestBefore = rows.reduce((a, b) => (b.before > a.before ? b : a)).k
  const bestAfter = rows.reduce((a, b) => (b.after > a.after ? b : a)).k
  return (
    <PanelBox title={t.schemes.shift} sub={t.schemes.shiftSub} right={<DemoTag label={t.src.estimated} />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 pr-3 font-semibold">{t.schemes.help}</th>
              <th className="py-2 pr-3 text-right font-semibold">{t.schemes.shiftBefore}</th>
              <th className="py-2 text-right font-semibold">{f(t.schemes.shiftAfter, { pct: pct(rate) })}</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => (
              <tr key={r.k} className="border-b border-line/60">
                <td className="py-2 pr-3">{t.schemes.shiftRows[r.k]}</td>
                <td className={`py-2 pr-3 text-right ${r.k === bestBefore ? 'font-bold' : ''}`}>{r.before}</td>
                <td className={`py-2 text-right ${r.k === bestAfter ? 'font-bold text-[#157a45]' : ''}`}>{r.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-semibold">{t.checks.lesson}</p>
      <p className="mt-1 text-sm text-muted">{f(t.schemes.usesLearned, { pct: pct(rate) })}</p>
    </PanelBox>
  )
}
