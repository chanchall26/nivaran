/**
 * "Agent Feed": 3 simulated state nodes exchanging small aggregated JSON summaries —
 * counts and averages only, never raw photos or raw sensor data. Pitched as a
 * Flower-compatible federated averaging pattern for the roadmap, not real Flower.
 */
import { Radio } from 'lucide-react'
import { useI18n } from '../i18n'
import { STATE_NODE_LABEL } from '../lib/hotspot'
import type { FederationMessage } from '../lib/federation'
import { ICON } from './atoms'

export function AgentFeed({ messages }: { messages: FederationMessage[] }) {
  const { t, f } = useI18n()
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Radio className="size-5 text-[#38bdf8]" {...ICON} aria-hidden />
        <h3 className="font-display text-lg font-bold">{t.hotspot.feed.title}</h3>
      </div>
      <p className="text-xs text-muted">{t.hotspot.feed.note}</p>
      {messages.length === 0 ? (
        <p className="text-sm text-muted">{t.hotspot.feed.empty}</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {messages.map((m) => (
            <li key={m.id} className="rounded-xl border border-line bg-[#0b1f3e] p-2.5 text-sm">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{m.summary.label} → {STATE_NODE_LABEL[m.to]}</span>
                <time>{new Date(m.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
              <p className="mt-1">
                {f(t.hotspot.feed.sent, {
                  from: m.summary.label,
                  to: STATE_NODE_LABEL[m.to],
                  count: m.summary.hotspotCount,
                  score: m.summary.avgConfidence,
                  source: m.summary.topSourceType,
                })}
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded-lg bg-black/30 p-1.5 text-[11px] text-[#94a3b8]">
                {JSON.stringify(m.summary)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
