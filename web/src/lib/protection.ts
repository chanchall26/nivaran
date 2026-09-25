/**
 * What is actually known about warmth at each Exposure Node, from the plan and from Pulse.
 * The file says "distributed"; only a Pulse answer can say "working" or "failed, because...".
 */
import type { NodeContext } from './budget'
import type { ExposureNode, ProtectionState } from './nodes'
import type { Delivery, PulseCheck, PulseReason, Report } from './types'

const FIXABLE: PulseReason[] = ['no_socket', 'electricity_bill', 'rwa_refused']

export interface NodeKnowledge {
  state: ProtectionState
  planHeater: NodeContext['heater']
  lastPulse?: PulseCheck
}

export function nodeKnowledge(node: ExposureNode, deliveries: Delivery[], pulses: PulseCheck[], reports: Report[]): NodeKnowledge {
  const mine = deliveries.filter((d) => d.nodeId === node.id)
  const heaterIds = new Set(mine.filter((d) => d.item === 'heater' || d.item === 'socket_fix').map((d) => d.id))
  const kits = mine.filter((d) => d.item === 'warm_kit' && d.status === 'working').reduce((a, d) => a + d.qty, 0)
  const lastPulse = pulses.filter((p) => heaterIds.has(p.deliveryId)).sort((a, b) => b.createdAt - a.createdAt)[0]
  const fireReports = reports.filter((r) => r.season === 'sardi' && ['guard_fire', 'homeless', 'labour_camp'].includes(r.category) &&
    Math.abs(r.lat - node.lat) < 0.003 && Math.abs(r.lon - node.lon) < 0.003).length

  let heater: ProtectionState['heater'] = node.winter.heater === 'none' ? 'none' : node.winter.heater === 'working' ? 'working' : 'distributed'
  if (heaterIds.size && heater === 'none') heater = 'distributed'
  let planHeater: NodeContext['heater'] = heater === 'distributed' ? 'unconfirmed' : heater === 'working' ? 'working' : 'none'
  if (lastPulse) {
    if (lastPulse.ok) {
      heater = 'working'
      planHeater = 'working'
    } else {
      heater = 'failed'
      planHeater = FIXABLE.includes(lastPulse.reason) ? 'failed_fixable' : 'failed_broken'
    }
  }
  return { state: { heater, failReason: lastPulse && !lastPulse.ok ? lastPulse.reason : undefined, warmKits: kits, fireReports }, planHeater, lastPulse }
}
