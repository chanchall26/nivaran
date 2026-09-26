/**
 * Standalone test screen for Track 4 (hotspot fusion UI + simulated federation). Not wired
 * into Entry/Today yet — Track 1 owns that shell. Reachable at /hotspot-lab so this can be
 * built and checked on its own, then folded into the real home screen later.
 */
import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { computeConfidence, demoSignals } from '../lib/fusion'
import { demoFeed } from '../lib/federation'
import { demoHotspots, type Hotspot } from '../lib/hotspot'
import { AgentFeed } from '../ui/AgentFeed'
import { SectionHead } from '../ui/atoms'
import { ConfidenceBreakdown } from '../ui/ConfidenceBreakdown'
import { HotspotMap } from '../ui/HotspotMap'

export default function HotspotLab() {
  const { t } = useI18n()
  const hotspots = useMemo<Hotspot[]>(() => demoHotspots(), [])
  const signals = useMemo(() => demoSignals(), [])
  const feed = useMemo(() => demoFeed(), [])
  const [selected, setSelected] = useState<string | null>(hotspots[0]?.id ?? null)

  const active = hotspots.find((h) => h.id === selected) ?? null
  const confidence = active ? computeConfidence(signals[active.id]) : null

  return (
    <div className="space-y-4">
      <SectionHead sub={t.hotspot.intro}>{t.hotspot.title}</SectionHead>
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="panel space-y-3 p-4">
          <h3 className="font-display text-lg font-bold">{t.hotspot.map.title}</h3>
          {hotspots.length === 0 ? (
            <p className="text-sm text-muted">{t.hotspot.map.empty}</p>
          ) : (
            <div className="h-[420px] overflow-hidden rounded-2xl">
              <HotspotMap hotspots={hotspots} selected={selected} onSelect={setSelected} />
            </div>
          )}
          <ul className="flex flex-wrap gap-2 text-sm">
            {hotspots.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => setSelected(h.id)}
                  className={`btn btn-sm ${h.id === selected ? 'btn-ink' : 'btn-line'}`}
                >
                  {h.place} · {t.hotspot.source[h.sourceType]}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          {active && confidence ? (
            <>
              <div className="panel space-y-1 p-4 text-sm">
                <p className="font-semibold">{active.place}</p>
                <p className="text-muted">
                  {t.hotspot.source[active.sourceType]} · {t.hotspot.severity[active.severity]} · {t.hotspot.status[active.status]}
                </p>
              </div>
              <ConfidenceBreakdown result={confidence} />
            </>
          ) : (
            <p className="text-sm text-muted">{t.hotspot.map.empty}</p>
          )}
        </div>
      </div>
      <AgentFeed messages={feed} />
    </div>
  )
}
