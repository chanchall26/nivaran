import { Database, FileDown, Loader2, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, inr, Stat } from '../components/ui'
import { seedDemo } from '../lib/demo'
import { computeLedger, type Range } from '../lib/impact'
import { ITEMS } from '../lib/match'
import { CATEGORY_LABEL, REASON_LABEL, ROUTE_INFO } from '../lib/policy'
import { store } from '../lib/store'
import type { ItemType, PulseReason } from '../lib/types'
import { fetchReplay } from '../lib/weather'
import { useApp } from '../state'

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const fmtRange = (r: Range, digits = 0) =>
  `${r.low.toLocaleString('en-IN', { maximumFractionDigits: digits })}–${r.high.toLocaleString('en-IN', { maximumFractionDigits: digits })}`

export default function Ledger() {
  const { city, deliveries, pulses, reports, typicalWeather } = useApp()
  const [busy, setBusy] = useState<'seed' | 'clear' | 'pdf' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const ledger = useMemo(() => computeLedger(deliveries, pulses, reports), [deliveries, pulses, reports])
  const hasDemo = deliveries.some((d) => d.demo) || reports.some((r) => r.demo)

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
      const coldNight = await fetchReplay('sardi')
      const n = await seedDemo({ cells: city.cells, places: city.places, norms: city.norms, coldNight, typicalWeather })
      setMsg(`Demo season load hua: ${n.deliveries} deliveries, ${n.pulses} pulse calls, ${n.reports} reports.`)
    } catch (e) {
      setMsg(`Demo load nahi hua: ${e}`)
    } finally {
      setBusy(null)
    }
  }

  const clear = async () => {
    setBusy('clear')
    await store.clearDemo()
    setBusy(null)
    setMsg('Demo data hata diya. Asli reports aur deliveries bachi hain.')
  }

  const pdf = async () => {
    setBusy('pdf')
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    let y = 56
    const line = (t: string, size = 11, bold = false, gap = 16) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(size)
      for (const l of doc.splitTextToSize(t, 480)) {
        if (y > 790) {
          doc.addPage()
          y = 56
        }
        doc.text(l, 56, y)
        y += gap
      }
    }
    doc.setFillColor(201, 80, 31)
    doc.rect(0, 0, 595, 8, 'F')
    line('Barahmasa Impact Report - Gwalior', 18, true, 24)
    line(`Generated ${new Date().toLocaleString('en-IN')}${hasDemo ? '  |  CONTAINS DEMO DATA' : ''}`, 9, false, 20)
    line('Measured (from Pulse check-ins)', 13, true, 20)
    line(`Heater active rate: ${pct(ledger.heaterActiveRate)} (${ledger.byItem.heater.working} of ${ledger.byItem.heater.checked} checked)`)
    line(`Sapling survival: ${pct(ledger.saplingSurvival)} (${ledger.byItem.sapling.working} of ${ledger.byItem.sapling.checked} checked)`)
    line(`People covered by working help: ${ledger.peopleCovered.toLocaleString('en-IN')}`)
    line(`Reports: ${ledger.reports.total} total, ${ledger.reports.resolved} resolved, median report-to-help ${
      ledger.reports.medianHoursToHelp == null ? 'n/a' : `${Math.round(ledger.reports.medianHoursToHelp)} h`}`)
    line(`Pulse calls: ${ledger.pulses}   |   Spend: Rs ${ledger.spendInr.toLocaleString('en-IN')}`, 11, false, 24)
    line('By item', 13, true, 20)
    for (const t of Object.keys(ITEMS) as ItemType[]) {
      const b = ledger.byItem[t]
      if (!b.units) continue
      line(`${ITEMS[t].label}: ${b.units} units, ${b.delivered} delivered, ${b.working}/${b.checked} working, ${b.people} people`)
    }
    y += 8
    line('Estimates (ranges, not measurements)', 13, true, 20)
    line(`PM2.5 avoided: ${fmtRange(ledger.pm25AvoidedKg, 1)} ${ledger.pm25AvoidedKg.unit}`)
    line(`Assumption: ${ledger.pm25AvoidedKg.assumption}`, 9)
    line(`Shade delivered: ${fmtRange(ledger.shadeHours)} ${ledger.shadeHours.unit}`)
    line(`Assumption: ${ledger.shadeHours.assumption}`, 9, false, 24)
    line('Why help failed (Pulse reasons)', 13, true, 20)
    for (const [r, n] of reasons) line(`${REASON_LABEL[r]}: ${n} units`)
    y += 8
    line('Method: scores from ESA WorldCover canopy, Landsat LST (May 2026), Meta HRSL population, OpenStreetMap and Open-Meteo weather. No person is ever routed to enforcement.', 9)
    doc.save('barahmasa-impact-gwalior.pdf')
    setBusy(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Saal-bhar ka Impact Ledger</h1>
          <p className="mt-1 max-w-2xl text-ink-2">
            Jo naapa gaya (Pulse calls se) woh number hai; jo model se nikla woh <b className="text-ink">range</b> hai, apne
            assumption ke saath.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={seed} disabled={!!busy || !city}
            className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">
            {busy === 'seed' ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} Demo season load karo
          </button>
          {hasDemo && (
            <button type="button" onClick={clear} disabled={!!busy}
              className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold">
              {busy === 'clear' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Demo hatao
            </button>
          )}
          <button type="button" onClick={pdf} disabled={!!busy}
            className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">
            {busy === 'pdf' ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} CSR report (PDF)
          </button>
        </div>
      </div>
      {msg && <p className="rounded-lg bg-paper px-3 py-2 text-sm">{msg}</p>}
      {hasDemo && (
        <p className="rounded-lg border border-dashed border-ink-3 px-3 py-2 text-sm text-ink-2">
          Is page pe <b>demo data</b> hai (asli Match engine se allocation, simulated Pulse jawab). Pilot mein ye asli calls se aayega.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Heater active rate" value={pct(ledger.heaterActiveRate)}
          sub={`${ledger.byItem.heater.working} / ${ledger.byItem.heater.checked} checked chal rahe`} />
        <Stat label="Paudhe zinda" value={pct(ledger.saplingSurvival)}
          sub={`${ledger.byItem.sapling.working} / ${ledger.byItem.sapling.checked} checked`} />
        <Stat label="Log covered (working help)" value={ledger.peopleCovered.toLocaleString('en-IN')} sub={`kharcha ${inr(ledger.spendInr)}`} />
        <Stat label="Report se madad tak" value={ledger.reports.medianHoursToHelp == null ? '—' : `${Math.round(ledger.reports.medianHoursToHelp)} h`}
          sub={`median · ${ledger.reports.resolved}/${ledger.reports.total} resolved`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Har item: kitna chal raha hai">
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2">
            <Legend color="bg-good" label="Chal raha / zinda" />
            <Legend color="bg-critical" label="Nahi chal raha / sookha" />
            <Legend color="bg-line" label="Check baaki" />
          </div>
          <ul className="space-y-3">
            {(Object.keys(ITEMS) as ItemType[]).filter((t) => ledger.byItem[t].units).map((t) => {
              const b = ledger.byItem[t]
              const failed = b.checked - b.working
              const unchecked = b.units - b.checked
              const w = (n: number) => `${(n / b.units) * 100}%`
              return (
                <li key={t}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{ITEMS[t].label}</span>
                    <span className="text-ink-2 tabular">{b.working} / {b.units}</span>
                  </div>
                  <div className="mt-1 flex h-3 gap-0.5 overflow-hidden rounded" role="img"
                    aria-label={`${b.working} chal rahe, ${failed} nahi, ${unchecked} check baaki`}>
                    {b.working > 0 && <div className="bg-good" style={{ width: w(b.working) }} title={`Chal raha: ${b.working}`} />}
                    {failed > 0 && <div className="bg-critical" style={{ width: w(failed) }} title={`Nahi chal raha: ${failed}`} />}
                    {unchecked > 0 && <div className="bg-line" style={{ width: w(unchecked) }} title={`Check baaki: ${unchecked}`} />}
                  </div>
                </li>
              )
            })}
            {!deliveries.length && <li className="text-sm text-ink-3">Abhi koi delivery nahi. Match se plan banao ya demo load karo.</li>}
          </ul>
        </Card>

        <Card title="Madad kyun nahi chali (Pulse se)">
          {reasons.length ? (
            <ul className="space-y-2">
              {reasons.map(([r, n]) => (
                <li key={r} className="grid grid-cols-[150px_1fr_40px] items-center gap-2 text-sm">
                  <span>{REASON_LABEL[r]}</span>
                  <div className="h-3 rounded bg-paper">
                    <div className="h-3 rounded bg-ink-2" style={{ width: `${(n / maxReason) * 100}%` }} title={`${n} units`} />
                  </div>
                  <span className="text-right tabular">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Abhi koi "nahi" jawab nahi.</p>
          )}
          <p className="mt-3 text-xs text-ink-3">
            Yahi data batata hai ki agla paisa heater pe nahi, shayad bijli-bill counselling ya insulated cabin pe lagna chahiye.
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Estimates (range, measurement nahi)">
          <dl className="space-y-4">
            {[ledger.pm25AvoidedKg, ledger.shadeHours].map((r, i) => (
              <div key={i}>
                <dt className="text-sm text-ink-2">{i === 0 ? 'PM2.5 jo hawa mein nahi gaya' : 'Chhaaya jo logon ko mili'}</dt>
                <dd className="text-2xl font-bold tabular">
                  {fmtRange(r, i === 0 ? 1 : 0)} <span className="text-sm font-normal text-ink-2">{r.unit}</span>
                </dd>
                <dd className="text-xs text-ink-3">Assumption: {r.assumption}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title={`Reports (${reports.length})`}>
          <div className="max-h-[300px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs text-ink-3">
                <tr><th className="py-1">Kya</th><th className="py-1">Raasta</th><th className="py-1">Status</th></tr>
              </thead>
              <tbody>
                {[...reports].sort((a, b) => b.createdAt - a.createdAt).slice(0, 60).map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2">{CATEGORY_LABEL[r.category]}</td>
                    <td className="py-1.5 pr-2 text-ink-2">{ROUTE_INFO[r.route].label}</td>
                    <td className="py-1.5">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Ek hi hexagon se dobara report: {ledger.reports.repeatCells} jagah. Ye number ghatna chahiye.
          </p>
        </Card>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block size-3 rounded-sm ${color}`} aria-hidden /> {label}
    </span>
  )
}
