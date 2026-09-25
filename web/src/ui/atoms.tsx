import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudRainWind, CloudSnow, CloudSun, Info, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { longDate } from '../lib/ist'
import { AQI_COLOR, aqiCategory, LEVEL_COLOR, type Level } from '../lib/risk'
import { useApp } from '../ctx'
import { Emoji, type EmojiName } from './Emoji'

export const ICON = { strokeWidth: 1.75 } as const

// ---------- weather words and icons (WMO codes) ----------

export type WxWord = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'heavy' | 'storm' | 'snow'
export function wxWord(code: number | undefined): WxWord {
  if (code == null || code <= 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code === 65 || code === 82 || code === 67) return 'heavy'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}
const WX_ICON: Record<WxWord, LucideIcon> = {
  clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, heavy: CloudRainWind, storm: CloudLightning, snow: CloudSnow,
}
export function WxIcon({ code, isDay = true, className }: { code: number | undefined; isDay?: boolean; className?: string }) {
  const w = wxWord(code)
  const I = w === 'clear' && !isDay ? Moon : WX_ICON[w]
  return <I className={className} {...ICON} aria-hidden />
}
export function useWxText() {
  const { t, lang } = useI18n()
  return (code: number | undefined) => {
    const w = wxWord(code)
    return w === 'snow' ? (lang === 'hi' ? 'बर्फ़' : 'Snow') : t.wx[w]
  }
}

// ---------- source on tap / hover ----------

/**
 * Wraps any number: hover, focus or tap shows where it comes from.
 * Use `kind` for the standard labels, or `text` for anything else.
 */
export function Src({ kind, text, children, className }: { kind?: 'live' | 'model' | 'replay' | 'demo' | 'estimated' | 'demoCost'; text?: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  const label = useSrcLabel(kind, text)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <span
      ref={ref}
      className={`relative inline-flex ${className ?? ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        aria-describedby={id}
        className="cursor-help"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen((o) => !o))}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute top-full left-0 z-50 mt-1 w-max max-w-[16rem] rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug font-medium text-white ${open ? '' : 'hidden'}`}
      >
        {label}
      </span>
    </span>
  )
}

export function useSrcLabel(kind?: string, text?: string) {
  const { t, f, lang } = useI18n()
  const { wx } = useApp()
  if (text) return text
  if (kind === 'replay' || (kind === 'live' && wx?.data.kind === 'replay'))
    return f(t.src.replay, { date: wx?.data.replayDate ? longDate(wx.data.replayDate, lang) : '' })
  if (kind === 'live') return t.src.live
  if (kind === 'model') return t.src.model
  if (kind === 'estimated') return t.src.estimated
  if (kind === 'demoCost') return t.src.demoCost
  return t.src.demo
}

/** The visible grey tag on anything that is not real. */
export function DemoTag({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <span className="inline-flex items-center rounded-full bg-[#16325c] px-2 py-0.5 text-xs font-semibold text-[#c7d3ea]">
      {label ?? t.src.demo}
    </span>
  )
}

// ---------- levels and air ----------

/** Colour never works alone: the dot always comes with its word. */
export function LevelBadge({ level, size = 'md' }: { level: Level; size?: 'sm' | 'md' | 'lg' }) {
  const { t } = useI18n()
  const pad = size === 'lg' ? 'px-3 py-1 text-base' : size === 'sm' ? 'px-2 py-0 text-xs' : 'px-2.5 py-0.5 text-sm'
  // ink reads best on green, yellow and orange; white only on red (AA contrast)
  const dark = level < 3
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad}`} style={{ background: LEVEL_COLOR[level], color: dark ? '#1b2330' : '#fff' }}>
      {t.level[level]}
    </span>
  )
}

export function AqiDot({ aqi, className }: { aqi: number; className?: string }) {
  const c = aqiCategory(aqi)
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/15 ${className ?? ''}`} style={{ background: AQI_COLOR[c] }} />
}

export function Skel({ className }: { className?: string }) {
  return <span aria-hidden className={`skel block ${className ?? ''}`} />
}

export function SectionHead({ children, right, sub, emoji }: { children: ReactNode; right?: ReactNode; sub?: ReactNode; emoji?: EmojiName }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-3">
        {emoji && (
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-[#0e2344]">
            <Emoji name={emoji} size={30} pop />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight font-bold">{children}</h2>
          {sub ? <p className="text-sm text-muted">{sub}</p> : <span aria-hidden className="mt-1 block h-1 w-10 rounded-full grad-brand" />}
        </div>
      </div>
      {right}
    </div>
  )
}

/** "Simple demo rules" info popover. */
export function RulesInfo() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" className="btn btn-ghost btn-sm text-muted" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Info className="size-4" {...ICON} aria-hidden /> {t.today.rules}
      </button>
      {open && (
        <div className="panel absolute right-0 z-40 mt-1 w-[min(22rem,85vw)] p-3 text-sm shadow-lg">
          <ul className="list-disc space-y-1.5 pl-4">
            {t.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Darker level colours for small text on white (AA contrast). */
export const LEVEL_TEXT = ['#4ade80', '#facc15', '#fb923c', '#f87171'] as const

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
