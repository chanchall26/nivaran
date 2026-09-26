/**
 * Shows a hotspot's confidence score as four visible +/- lines, never a bare number.
 * Each line is one signal from lib/fusion.ts: wind direction, PM ratio, Gemini photo
 * check, FIRMS satellite point.
 */
import { useI18n } from '../i18n'
import type { ConfidenceResult, SignalKey } from '../lib/fusion'

const MAX_ABS = 30

function Bar({ points }: { points: number }) {
  const pct = Math.min(100, (Math.abs(points) / MAX_ABS) * 100)
  const positive = points >= 0
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#0b1f3e]" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
      <div
        className="absolute inset-y-0 rounded-full"
        style={{
          width: `${pct / 2}%`,
          left: positive ? '50%' : `${50 - pct / 2}%`,
          background: positive ? '#1E9E5A' : '#D7263D',
        }}
      />
    </div>
  )
}

export function ConfidenceBreakdown({ result }: { result: ConfidenceResult }) {
  const { t, f } = useI18n()
  const label: Record<SignalKey, string> = {
    wind: t.hotspot.confidence.wind,
    pmRatio: t.hotspot.confidence.pmRatio,
    photo: t.hotspot.confidence.photo,
    firms: t.hotspot.confidence.firms,
  }
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">{t.hotspot.confidence.title}</h3>
        <span className="text-sm font-semibold text-muted">{f(t.hotspot.confidence.score, { score: result.total })}</span>
      </div>
      <p className="text-xs font-semibold text-muted uppercase">{t.hotspot.confidence.why}</p>
      <ul className="space-y-3">
        {result.breakdown.map((c) => (
          <li key={c.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{label[c.key]}</span>
              <span className={`font-semibold ${c.points > 0 ? 'text-[#4ade80]' : c.points < 0 ? 'text-[#f87171]' : 'text-muted'}`}>
                {c.points > 0 ? `+${c.points}` : c.points}
              </span>
            </div>
            <Bar points={c.points} />
            <p className="text-xs text-muted">{c.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
