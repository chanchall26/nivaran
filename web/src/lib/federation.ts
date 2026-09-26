/**
 * Simulated federation between 3 state nodes. NOT real Flower — a "Flower-compatible
 * federated averaging pattern" for the deck/roadmap. Each node only ever shares a small
 * aggregated JSON summary of its own hotspots (counts, average confidence, top source type),
 * never raw photos or raw sensor readings. This file only builds/plays back demo messages
 * for the Agent Feed panel.
 */
import { demoHotspots, STATE_NODE_LABEL, type Hotspot, type StateNode } from './hotspot'

export interface StateSummary {
  stateNode: StateNode
  label: string
  hotspotCount: number
  avgConfidence: number
  topSourceType: string
}

export interface FederationMessage {
  id: string
  ts: string
  from: StateNode
  to: StateNode
  /** the small aggregated JSON actually "sent" — this is the whole payload, nothing hidden */
  summary: StateSummary
}

const NODES: StateNode[] = ['delhi-ncr', 'punjab', 'haryana']

/** Aggregates one node's hotspots into the tiny JSON it is allowed to share. */
export function summarize(stateNode: StateNode, hotspots: Hotspot[]): StateSummary {
  const mine = hotspots.filter((h) => h.stateNode === stateNode)
  const avgConfidence = mine.length ? Math.round(mine.reduce((s, h) => s + h.confidence, 0) / mine.length) : 0
  const counts = new Map<string, number>()
  for (const h of mine) counts.set(h.sourceType, (counts.get(h.sourceType) ?? 0) + 1)
  const topSourceType = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none'
  return { stateNode, label: STATE_NODE_LABEL[stateNode], hotspotCount: mine.length, avgConfidence, topSourceType }
}

/** One round: every node broadcasts its summary to every other node (small, not raw data). */
export function nextRound(hotspots: Hotspot[], atISO: string): FederationMessage[] {
  const summaries = new Map(NODES.map((n) => [n, summarize(n, hotspots)]))
  const out: FederationMessage[] = []
  let i = 0
  for (const from of NODES) {
    for (const to of NODES) {
      if (from === to) continue
      out.push({ id: `${atISO}-${i++}`, ts: atISO, from, to, summary: summaries.get(from)! })
    }
  }
  return out
}

/** a short demo feed, as if a few rounds had already run */
export function demoFeed(): FederationMessage[] {
  const hotspots = demoHotspots()
  const rounds = ['2026-09-26T05:00:00+05:30', '2026-09-26T05:30:00+05:30', '2026-09-26T06:00:00+05:30']
  return rounds.flatMap((ts) => nextRound(hotspots, ts))
}
