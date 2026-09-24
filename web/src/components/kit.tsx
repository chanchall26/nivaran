/**
 * Small UI kit: 3D buttons, tilt cards, season + language toggles, need ring,
 * level pill, weather chips. Everything reads theme tokens, so it follows the season.
 */
import { CircleAlert, CloudSun, History, Radio, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useRef, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { band, cityAlert, type Band } from '../lib/scoring'
import type { WeatherSource } from '../lib/types'
import { useApp } from '../state'

// ---- buttons ---------------------------------------------------------------------------

type BtnVariant = 'primary' | 'soft' | 'dark'
const btnSize = { sm: 'px-3.5 py-2 text-sm', md: 'px-5 py-3 text-base', lg: 'px-6 py-4 text-lg' }

export function Btn({
  variant = 'primary', size = 'md', className = '', children, ...rest
}: { variant?: BtnVariant; size?: keyof typeof btnSize } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn-3d btn-${variant} ${btnSize[size]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function BtnLink({
  to, variant = 'primary', size = 'md', className = '', children,
}: { to: string; variant?: BtnVariant; size?: keyof typeof btnSize; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`btn-3d btn-${variant} ${btnSize[size]} ${className}`}>
      {children}
    </Link>
  )
}

// ---- tilt ------------------------------------------------------------------------------------

/** Pointer-driven 3D tilt. Skipped on touch screens and for reduced motion (CSS). */
export function useTilt<T extends HTMLElement>(max = 8) {
  const ref = useRef<T>(null)
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    ref.current.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`)
    ref.current.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`)
    ref.current.style.setProperty('--px', x.toFixed(3))
    ref.current.style.setProperty('--py', y.toFixed(3))
  }
  const onPointerLeave = () => {
    for (const k of ['--rx', '--ry', '--px', '--py']) ref.current?.style.setProperty(k, k.startsWith('--r') ? '0deg' : '0')
  }
  return { ref, onPointerMove, onPointerLeave }
}

export function TiltCard({ children, className = '', max = 7, style }: { children: ReactNode; className?: string; max?: number; style?: CSSProperties }) {
  const t = useTilt<HTMLDivElement>(max)
  return (
    <div ref={t.ref} onPointerMove={t.onPointerMove} onPointerLeave={t.onPointerLeave} className={`tilt ${className}`} style={style}>
      {children}
    </div>
  )
}

// ---- toggles ----------------------------------------------------------------------------

/** A 3D sun/moon orb that rolls between the two seasons. */
export function SeasonToggle({ compact = false }: { compact?: boolean }) {
  const { season, setSeason } = useApp()
  const { s } = useI18n()
  const sardi = season === 'sardi'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={sardi}
      aria-label={`${s.season.label}: ${sardi ? s.season.sardi : s.season.garmi}`}
      onClick={() => setSeason(sardi ? 'garmi' : 'sardi')}
      className={`relative flex items-center rounded-full border border-line bg-surface-2 p-1 shadow-[inset_0_2px_6px_rgb(var(--shade)/0.18)] ${
        compact ? 'h-10 w-[7.5rem]' : 'h-12 w-[9.5rem]'
      }`}
    >
      <span className={`relative z-10 flex-1 text-center font-display text-sm font-extrabold transition-colors ${sardi ? 'text-ink-3' : 'text-[#3a1a02]'}`}>
        {s.season.garmi}
      </span>
      <span className={`relative z-10 flex-1 text-center font-display text-sm font-extrabold transition-colors ${sardi ? 'text-[#0b1a44]' : 'text-ink-3'}`}>
        {s.season.sardi}
      </span>
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full transition-transform duration-500 [transition-timing-function:cubic-bezier(.6,-0.2,.3,1.3)]"
        style={{
          transform: sardi ? 'translateX(100%)' : 'translateX(0)',
          background: sardi
            ? 'radial-gradient(circle at 35% 30%, #fff 0%, #cfe0ff 30%, #7d9fe0 70%, #3c5ba8 100%)'
            : 'radial-gradient(circle at 35% 30%, #fff6c9 0%, #ffcf4a 35%, #ff9a1f 75%, #e26a00 100%)',
          boxShadow: sardi
            ? '0 0 18px rgb(143 188 255 / .55), inset -3px -4px 8px rgb(0 0 0 / .25)'
            : '0 0 20px rgb(255 170 40 / .7), inset -3px -4px 8px rgb(160 60 0 / .3)',
        }}
      />
    </button>
  )
}

export function LangToggle({ single = false }: { single?: boolean }) {
  const { lang, setLang, s } = useI18n()
  if (single) {
    // phones: one tap flips to the other language; the button shows where it goes
    const other = lang === 'en' ? 'hi' : 'en'
    return (
      <button
        type="button"
        onClick={() => setLang(other)}
        aria-label={`${s.lang.label}: ${other === 'hi' ? s.lang.hi : s.lang.en}`}
        className="flex size-10 items-center justify-center rounded-full border border-line bg-surface-2 font-display text-sm font-extrabold shadow-[0_3px_0_var(--line)]"
      >
        {other === 'hi' ? 'हिं' : 'EN'}
      </button>
    )
  }
  return (
    <div role="group" aria-label={s.lang.label} className="flex rounded-full border border-line bg-surface-2 p-1 text-sm font-bold">
      {(['en', 'hi'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 transition-colors ${lang === l ? 'bg-ink text-bg shadow' : 'text-ink-2'}`}
        >
          {l === 'en' ? 'EN' : 'हिं'}
        </button>
      ))}
    </div>
  )
}

// ---- need & levels -----------------------------------------------------------------------

export const LEVEL_COLOR: Record<Band, string> = {
  critical: 'var(--color-critical)',
  serious: 'var(--color-serious)',
  warning: 'var(--color-warning)',
  ok: 'var(--color-good)',
}

export function LevelPill({ level, text }: { level: Band; text: string }) {
  const Icon = level === 'ok' ? ShieldCheck : level === 'warning' ? CircleAlert : TriangleAlert
  const dark = level === 'warning' || level === 'serious'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-sm font-bold shadow-[0_3px_0_rgb(0_0_0/0.18)]"
      style={{ background: LEVEL_COLOR[level], color: dark ? '#2b1608' : '#fff' }}
    >
      <Icon className="size-4" aria-hidden />
      {text}
    </span>
  )
}

/** Big ring showing need 0-100 (high = more need), coloured by its level. */
export function NeedRing({ score, size = 112 }: { score: number; size?: number }) {
  const { s } = useI18n()
  const need = 100 - score
  const lvl = band(score)
  const r = 44
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${s.need.label} ${need} ${s.need.outOf}`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90 drop-shadow-[0_6px_10px_rgb(var(--shade)/0.3)]">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={LEVEL_COLOR[lvl]} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(need / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl leading-none font-extrabold tabular">{need}</span>
        <span className="text-[11px] text-ink-3">{s.need.outOf}</span>
      </div>
    </div>
  )
}

export function needText(score: number, s: ReturnType<typeof useI18n>['s']) {
  return s.need[band(score)]
}

// ---- weather ---------------------------------------------------------------------------------

export function WeatherChips() {
  const { weatherSource, setWeatherSource, season } = useApp()
  const { s } = useI18n()
  const items: { key: WeatherSource; label: string; hint: string; Icon: typeof Radio }[] = [
    { key: 'live', label: s.weather.live, hint: s.weather.liveHint, Icon: Radio },
    { key: 'replay', label: season === 'sardi' ? s.weather.replaySardi : s.weather.replayGarmi, hint: s.weather.replayHint, Icon: History },
    { key: 'typical', label: s.weather.typical, hint: s.weather.typicalHint, Icon: CloudSun },
  ]
  return (
    <div role="group" aria-label="Weather" className="flex flex-wrap gap-1.5">
      {items.map(({ key, label, hint, Icon }) => (
        <button
          key={key}
          type="button"
          title={hint}
          aria-pressed={weatherSource === key}
          onClick={() => setWeatherSource(key)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${
            weatherSource === key
              ? 'border-transparent bg-ink text-bg shadow-[0_3px_0_rgb(var(--shade)/0.35)]'
              : 'border-line bg-surface text-ink-2 hover:text-ink'
          }`}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}

/** Where the weather numbers come from, in words. */
export function useWeatherLabel() {
  const { weather, season, weatherSource } = useApp()
  const { s, f } = useI18n()
  const label =
    weatherSource === 'live'
      ? s.weather.labelLive
      : weatherSource === 'replay'
        ? f(season === 'sardi' ? s.weather.labelReplaySardi : s.weather.labelReplayGarmi, { date: weather.date })
        : s.weather.labelTypical
  return f(s.weather.from, { label })
}

/** The one-line danger summary for the city. */
export function CityStatus({ big = false }: { big?: boolean }) {
  const { season, weather, weatherLoading, weatherError } = useApp()
  const { s, f } = useI18n()
  const a = cityAlert(season, weather)
  const from = useWeatherLabel()
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <LevelPill level={a.level} text={s.level[a.level]} />
        {weather.pm25 != null && (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2 tabular">
            {f(s.alert.pm, { v: Math.round(weather.pm25) })} µg/m³
          </span>
        )}
      </div>
      <p className={`font-display font-bold leading-tight ${big ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
        {weatherLoading
          ? s.weather.loading
          : f(season === 'sardi' ? s.alert.nightFeels : s.alert.dayFeels, { t: Math.round(a.feels) })}
      </p>
      <p className="text-sm text-ink-2">
        {a.trapWord ? s.alert[a.trapWord as 'trapStrong'] : f(s.alert.humidity, { h: Math.round(a.humidity ?? 0) })}
        <span className="text-ink-3"> · {from}</span>
      </p>
      {weatherError && <p className="text-xs text-critical">{s.weather.error}</p>}
    </div>
  )
}

// ---- misc --------------------------------------------------------------------------------------

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{children}</h2>
      {sub && <p className="mt-1 max-w-2xl text-ink-2">{sub}</p>}
    </div>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`surface-3d p-5 sm:p-6 ${className}`}>{children}</section>
}

export function BigStat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <TiltCard className="surface-3d p-4 sm:p-5" max={6}>
      <div className="pop">
        <div className="text-sm text-ink-2">{label}</div>
        <div className="mt-1 font-display text-3xl font-extrabold tabular sm:text-4xl" style={tone ? { color: tone } : undefined}>
          {value}
        </div>
        {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
      </div>
    </TiltCard>
  )
}

export function SourceTag({ source }: { source: string }) {
  const { s } = useI18n()
  const est = source !== 'osm-anchored'
  const text = source === 'osm-anchored' ? s.place.sourceOsm : source === 'synthetic' ? s.place.sourceSynthetic : s.place.sourceDemo
  return (
    <span className={`rounded-md border px-1.5 text-[10px] font-semibold uppercase tracking-wide ${est ? 'border-dashed border-ink-3 text-ink-3' : 'border-line text-ink-2'}`}>
      {text}
    </span>
  )
}

export const inr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`

/** Free deep link: opens Google Maps directions on the phone (no API key needed). */
export const directionsUrl = (lat: number, lon: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lon.toFixed(5)}&travelmode=driving`
