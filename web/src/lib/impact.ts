/**
 * Impact Ledger numbers. Measured things (from Pulse and reports) are reported as
 * counts; anything modelled is an ESTIMATE with a low-high range and its assumption.
 */
import { ITEMS } from './match'
import type { Delivery, ItemType, PulseCheck, Report } from './types'

export interface Range {
  low: number
  high: number
  unit: string
  assumption: string
}

export interface Ledger {
  byItem: Record<ItemType, { units: number; delivered: number; checked: number; working: number; people: number }>
  heaterActiveRate: number | null
  saplingSurvival: number | null
  peopleCovered: number
  reports: { total: number; open: number; resolved: number; medianHoursToHelp: number | null; repeatCells: number }
  pulses: number
  spendInr: number
  pm25AvoidedKg: Range
  shadeHours: Range
}

const ACTIVE: Delivery['status'][] = ['working', 'alive']
const FAILED: Delivery['status'][] = ['not_working', 'dead']

export function computeLedger(deliveries: Delivery[], pulses: PulseCheck[], reports: Report[], seasonDays = 90): Ledger {
  const byItem = Object.fromEntries(
    (Object.keys(ITEMS) as ItemType[]).map((t) => [t, { units: 0, delivered: 0, checked: 0, working: 0, people: 0 }]),
  ) as Ledger['byItem']

  for (const d of deliveries) {
    const b = byItem[d.item]
    b.units += d.qty
    if (d.status !== 'planned') b.delivered += d.qty
    if (ACTIVE.includes(d.status) || FAILED.includes(d.status)) b.checked += d.qty
    if (ACTIVE.includes(d.status)) {
      b.working += d.qty
      b.people += d.people
    }
  }
  const rate = (t: ItemType) => (byItem[t].checked ? byItem[t].working / byItem[t].checked : null)

  const resolved = reports.filter((r) => r.status === 'resolved' && r.resolvedAt)
  const hours = resolved.map((r) => (r.resolvedAt! - r.createdAt) / 3_600_000).sort((a, b) => a - b)
  const perCell = new Map<string, number>()
  for (const r of reports) perCell.set(r.h3, (perCell.get(r.h3) ?? 0) + 1)

  // PM2.5 avoided: each working heater / worn warm kit replaces one small warming fire on
  // cold nights. Fire size 2-5 kg of waste/wood per night; open-burning PM2.5 emission
  // factor ~8-10 g/kg (Wiedinmyer et al. 2014, open waste burning); 40-60 % of season
  // nights cold enough to burn; 50-80 % of fires actually displaced.
  const warmUnits = byItem.heater.working + byItem.warm_kit.working * 0.5 + byItem.cabin.working
  const pmLow = (warmUnits * seasonDays * 0.4 * 0.5 * 2 * 8) / 1000
  const pmHigh = (warmUnits * seasonDays * 0.6 * 0.8 * 5 * 10) / 1000

  // Shade-hours: people x hours under working shade nets/cabins per summer (Apr-Jun, 6-8 h/day)
  const shaded = byItem.shade_net.people + byItem.cabin.people
  const shadeLow = shaded * 75 * 6
  const shadeHigh = shaded * 90 * 8

  return {
    byItem,
    heaterActiveRate: rate('heater'),
    saplingSurvival: rate('sapling'),
    peopleCovered: Object.values(byItem).reduce((s, b) => s + b.people, 0),
    reports: {
      total: reports.length,
      open: reports.filter((r) => r.status !== 'resolved').length,
      resolved: resolved.length,
      medianHoursToHelp: hours.length ? hours[hours.length >> 1] : null,
      repeatCells: [...perCell.values()].filter((n) => n > 1).length,
    },
    pulses: pulses.length,
    spendInr: deliveries.reduce((s, d) => s + d.qty * ITEMS[d.item].unitCostInr, 0),
    pm25AvoidedKg: {
      low: pmLow, high: pmHigh, unit: 'kg PM2.5 / season',
      assumption: '1 chalti heater = 1 kam aag; 2-5 kg kachra/raat; 8-10 g PM2.5/kg; 40-60% raatein thandi',
    },
    shadeHours: {
      low: shadeLow, high: shadeHigh, unit: 'person-hours chhaaya / garmi',
      assumption: 'Apr-Jun ke 75-90 din, 6-8 ghante roz, sirf "working" shade/cabin',
    },
  }
}
