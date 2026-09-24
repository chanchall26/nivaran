import { Database, FileDown, Loader2, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BigStat, Btn, inr, Panel, SectionTitle } from '../components/kit'
import { useI18n } from '../i18n'
import { STRINGS } from '../i18n/strings'
import { seedDemo } from '../lib/demo'
import { computeLedger, type Range } from '../lib/impact'
import { ITEMS } from '../lib/match'
import { store } from '../lib/store'
import type { ItemType, PulseReason } from '../lib/types'
import { fetchReplay } from '../lib/weather'
import { useApp } from '../state'

export default function Ledger() {
  const { city, deliveries, pulses, reports, typicalWeather } = useApp()
  const { s, f, num, lang } = useI18n()
  const [busy, setBusy] = useState<'seed' | 'clear' | 'pdf' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const ledger = useMemo(() => computeLedger(deliveries, pulses, reports), [deliveries, pulses, reports])
  const hasDemo = deliveries.some((d) => d.demo) || reports.some((r) => r.demo)
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)
  const range = (r: Range, d = 0) => `${num(r.low, d)}–${num(r.high, d)}`

  const reasons = useMemo(() => {
    const m = new Map<PulseReason, number>()
    for (const d of deliveries) if (d.lastReason && d.lastReason !== 'none') m.set(d.lastReason, (m.get(d.lastReason) ?? 0) + d.qty)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [deliveries])
  const maxReason = Math.max(1, ...reasons.map(([, n]) => n))

  const seed = async () => {
    if (!city) return
    setBusy('seed')
    setMsg(null)
    try {
      // a sample season replaces the previous one instead of stacking on top of it
      await store.clearDemo()
      const coldNight = await fetchReplay('sardi')
      const n = await seedDemo({ cells: city.cells, places: city.places, norms: city.norms, coldNight, typicalWeather })
      setMsg(f(s.results.demoLoaded, { d: n.deliveries, p: n.pulses, r: n.reports }))
    } catch (e) {
      setMsg(f(s.results.demoFailed, { e: String(e) }))
    } finally {
      setBusy(null)
    }
  }

  const clear = async () => {
    setBusy('clear')
    await store.clearDemo()
    setBusy(null)
    setMsg(s.results.demoCleared)
  }

  // PDF stays in English: it goes to CSR donors, and jsPDF's built-in fonts have no Devanagari.
  const pdf = async () => {
    setBusy('pdf')
    const E = STRINGS.en
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    let y = 56
    const line = (t: string, size = 11, bold = false, gap = 16) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(size)
      for (const l of doc.splitTextToSize(t.replace(/₹/g, 'Rs '), 480)) {
        if (y > 790) {
          doc.addPage()
          y = 56
        }
        doc.text(l, 56, y)
        y += gap
      }
    }
    doc.setFillColor(228, 87, 30)
    doc.rect(0, 0, 298, 8, 'F')
    doc.setFillColor(28, 92, 171)
    doc.rect(298, 0, 298, 8, 'F')
    line('Barahmasa - Impact Report, Gwalior', 18, true, 24)
    line(`Generated ${new Date().toLocaleString('en-IN')}${hasDemo ? '  |  CONTAINS SAMPLE DATA' : ''}`, 9, false, 20)
    line('Measured (from check-in calls)', 13, true, 20)
    line(`Heaters working: ${pct(ledger.heaterActiveRate)} (${ledger.byItem.heater.working} of ${ledger.byItem.heater.checked} checked)`)
    line(`Trees alive: ${pct(ledger.saplingSurvival)} (${ledger.byItem.sapling.working} of ${ledger.byItem.sapling.checked} checked)`)
    line(`People helped by working help: ${ledger.peopleCovered.toLocaleString('en-IN')}`)
    line(`Reports: ${ledger.reports.total}, solved ${ledger.reports.resolved}, median report-to-help ${
      ledger.reports.medianHoursToHelp == null ? 'n/a' : `${Math.round(ledger.reports.medianHoursToHelp)} h`}`)
    line(`Check-in calls: ${ledger.pulses}   |   Spend: ${inr(ledger.spendInr)}`, 11, false, 24)
    line('By item', 13, true, 20)
    for (const t of Object.keys(ITEMS) as ItemType[]) {
      const b = ledger.byItem[t]
      if (b.units) line(`${E.item[t]}: ${b.units} units, ${b.delivered} delivered, ${b.working}/${b.checked} working, ${b.people} people`)
    }
    y += 8
    line('Estimates (ranges, not measurements)', 13, true, 20)
    line(`${E.results.pm}: ${range(ledger.pm25AvoidedKg, 1)} ${E.results.pmUnit}`)
    line(`Why: ${E.results.pmWhy}`, 9)
    line(`${E.results.shade}: ${range(ledger.shadeHours)} ${E.results.shadeUnit}`)
    line(`Why: ${E.results.shadeWhy}`, 9, false, 24)
    line(E.results.whyFail, 13, true, 20)
    for (const [r, n] of reasons) line(`${E.reason[r]}: ${n} units`)
    y += 8
    line('Method: canopy and summer land-surface temperature computed on Google Earth Engine (ESA WorldCover, Landsat 8/9), Meta HRSL population, OpenStreetMap, Open-Meteo weather. No person is ever routed to enforcement.', 9)
    doc.save('barahmasa-impact-gwalior.pdf')
    setBusy(null)
  }

  const statusLabel = { open: s.results.open, assigned: s.results.assigned, resolved: s.results.resolved }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle sub={s.results.intro}>{s.results.title}</SectionTitle>
        <div className="flex flex-wrap gap-2.5">
          <Btn variant="soft" onClick={seed} disabled={!!busy || !city}>
            {busy === 'seed' ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} {s.results.loadDemo}
          </Btn>
          {hasDemo && (
            <Btn variant="soft" onClick={clear} disabled={!!busy}>
              {busy === 'clear' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} {s.results.clearDemo}
            </Btn>
          )}
          <Btn variant="dark" onClick={pdf} disabled={!!busy}>
            {busy === 'pdf' ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} {s.results.pdf}
          </Btn>
        </div>
      </div>
      {msg && <p className="rounded-2xl bg-surface-2 px-4 py-3 font-semibold">{msg}</p>}
      {hasDemo && <p className="rounded-2xl border-2 border-dashed border-ink-3 px-4 py-3 text-sm text-ink-2">{s.results.demoBanner}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BigStat label={s.results.heaters} value={pct(ledger.heaterActiveRate)} tone="var(--color-good)"
          sub={f(s.results.heatersSub, { w: ledger.byItem.heater.working, c: ledger.byItem.heater.checked })} />
        <BigStat label={s.results.trees} value={pct(ledger.saplingSurvival)} tone="var(--color-good)"
          sub={f(s.results.treesSub, { w: ledger.byItem.sapling.working, c: ledger.byItem.sapling.checked })} />
        <BigStat label={s.results.helped} value={num(ledger.peopleCovered)} sub={f(s.results.helpedSub, { c: inr(ledger.spendInr) })} />
        <BigStat
          label={s.results.speed}
          value={ledger.reports.medianHoursToHelp == null ? '—' : f(s.results.hours, { h: Math.round(ledger.reports.medianHoursToHelp) })}
          sub={f(s.results.speedSub, { r: ledger.reports.resolved, t: ledger.reports.total })}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="font-display text-xl font-extrabold">{s.results.byItem}</h2>
          <div className="mt-3 mb-4 flex flex-wrap gap-4 text-xs font-semibold text-ink-2">
            {[
              ['bg-good', s.results.keyWorking],
              ['bg-critical', s.results.keyFailed],
              ['bg-line', s.results.keyUnchecked],
            ].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className={`inline-block size-3 rounded ${c}`} aria-hidden /> {l}
              </span>
            ))}
          </div>
          <ul className="space-y-4">
            {(Object.keys(ITEMS) as ItemType[]).filter((t) => ledger.byItem[t].units).map((t) => {
              const b = ledger.byItem[t]
              const failed = b.checked - b.working
              const unchecked = b.units - b.checked
              const w = (n: number) => `${(n / b.units) * 100}%`
              return (
                <li key={t}>
                  <div className="flex justify-between text-sm">
                    <span className="font-bold">{s.item[t]}</span>
                    <span className="font-display font-extrabold tabular">{b.working} / {b.units}</span>
                  </div>
                  <div className="mt-1.5 flex h-4 gap-0.5 overflow-hidden rounded-full shadow-[inset_0_1px_3px_rgb(0_0_0/0.2)]" role="img"
                    aria-label={`${s.results.keyWorking} ${b.working}, ${s.results.keyFailed} ${failed}, ${s.results.keyUnchecked} ${unchecked}`}>
                    {b.working > 0 && <div className="bg-good" style={{ width: w(b.working) }} title={`${s.results.keyWorking}: ${b.working}`} />}
                    {failed > 0 && <div className="bg-critical" style={{ width: w(failed) }} title={`${s.results.keyFailed}: ${failed}`} />}
                    {unchecked > 0 && <div className="bg-line" style={{ width: w(unchecked) }} title={`${s.results.keyUnchecked}: ${unchecked}`} />}
                  </div>
                </li>
              )
            })}
            {!deliveries.length && <li className="text-ink-3">{s.results.noDeliveries}</li>}
          </ul>
        </Panel>

        <Panel>
          <h2 className="font-display text-xl font-extrabold">{s.results.whyFail}</h2>
          {reasons.length ? (
            <ul className="mt-4 space-y-3">
              {reasons.map(([r, n]) => (
                <li key={r}>
                  <div className="flex justify-between text-sm">
                    <span className="font-bold">{s.reason[r]}</span>
                    <span className="font-display font-extrabold tabular">{n}</span>
                  </div>
                  <div className="mt-1 h-3 rounded-full bg-surface-2">
                    <div className="h-3 rounded-full bg-ink-2" style={{ width: `${(n / maxReason) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-ink-3">{s.results.noFail}</p>
          )}
          <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-semibold">{s.results.whyFailNote}</p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="font-display text-xl font-extrabold">{s.results.estimates}</h2>
          <dl className="mt-4 space-y-5">
            {[
              [s.results.pm, range(ledger.pm25AvoidedKg, 1), s.results.pmUnit, s.results.pmWhy],
              [s.results.shade, range(ledger.shadeHours), s.results.shadeUnit, s.results.shadeWhy],
            ].map(([label, value, unit, why]) => (
              <div key={label}>
                <dt className="text-sm font-semibold text-ink-2">{label}</dt>
                <dd className="font-display text-3xl font-extrabold tabular">
                  {value} <span className="text-base font-semibold text-ink-2">{unit}</span>
                </dd>
                <dd className="text-xs text-ink-3">{why}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel>
          <h2 className="font-display text-xl font-extrabold">{f(s.results.reportsTitle, { n: reports.length })}</h2>
          <div className="mt-3 max-h-[320px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-ink-3">
                <tr>
                  <th className="py-1.5 pr-2">{s.results.colWhat}</th>
                  <th className="py-1.5 pr-2">{s.results.colRoute}</th>
                  <th className="py-1.5">{s.results.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {[...reports].sort((a, b) => b.createdAt - a.createdAt).slice(0, 60).map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-2 pr-2">{(lang === 'hi' ? r.summaryHi : r.summary) || s.cat[r.category]}</td>
                    <td className="py-2 pr-2 text-ink-2">{s.route[r.route]}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === 'resolved' ? 'bg-good/15 text-good' : 'bg-warning/20 text-ink'}`}>
                        {statusLabel[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">{f(s.results.repeat, { n: ledger.reports.repeatCells })}</p>
        </Panel>
      </div>
    </div>
  )
}
