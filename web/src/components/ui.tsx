import { CloudSun, Flame, History, Radio, Snowflake, Sun, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { BAND_LABEL, cityAlert, type Band } from '../lib/scoring'
import type { Season, WeatherSource } from '../lib/types'
import { useApp } from '../state'

export function SeasonSwitch({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { season, setSeason } = useApp()
  const big = size === 'lg'
  const btn = (s: Season, label: string, sub: string, Icon: typeof Sun) => {
    const on = season === s
    const tone = s === 'garmi' ? 'bg-garmi-600 text-white' : 'bg-sardi-600 text-white'
    return (
      <button
        type="button"
        onClick={() => setSeason(s)}
        aria-pressed={on}
        className={`flex items-center gap-1.5 rounded-full font-semibold transition-colors ${
          big ? 'px-5 py-2.5 text-base' : 'px-3 py-1.5 text-sm'
        } ${on ? tone : 'text-ink-2 hover:bg-black/5'}`}
      >
        <Icon className={big ? 'size-5' : 'size-4'} aria-hidden />
        {label}
        {big && <span className="font-normal opacity-80">· {sub}</span>}
      </button>
    )
  }
  return (
    <div className="inline-flex rounded-full border border-line bg-white p-1" role="group" aria-label="Mausam">
      {btn('garmi', 'Garmi', 'Chhaya', Sun)}
      {btn('sardi', 'Sardi', 'Garmahat', Snowflake)}
    </div>
  )
}

const SOURCES: { key: WeatherSource; label: string; Icon: typeof Radio; hint: string }[] = [
  { key: 'live', label: 'Live', Icon: Radio, hint: 'Aaj ka Open-Meteo forecast' },
  { key: 'replay', label: 'Replay', Icon: History, hint: 'Pichhle season ki sabse kharab raat/din' },
  { key: 'typical', label: 'Planning', Icon: CloudSun, hint: 'Aam January raat / May din' },
]

export function WeatherSourcePicker() {
  const { weatherSource, setWeatherSource } = useApp()
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-sm" role="group" aria-label="Weather source">
      {SOURCES.map(({ key, label, Icon, hint }) => (
        <button
          key={key}
          type="button"
          title={hint}
          aria-pressed={weatherSource === key}
          onClick={() => setWeatherSource(key)}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${
            weatherSource === key ? 'bg-ink text-white' : 'text-ink-2 hover:bg-black/5'
          }`}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}

export const BAND_STYLE: Record<Band, string> = {
  critical: 'bg-critical text-white',
  serious: 'bg-serious text-ink',
  warning: 'bg-warning text-ink',
  ok: 'bg-good text-white',
}

export function BandPill({ band, children }: { band: Band; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_STYLE[band]}`}>
      {band !== 'ok' && <TriangleAlert className="size-3" aria-hidden />}
      {children ?? BAND_LABEL[band]}
    </span>
  )
}

/** One line that says how dangerous today/tonight is, and where that number came from. */
export function CityAlert({ compact = false }: { compact?: boolean }) {
  const { season, weather, weatherLoading, weatherError } = useApp()
  const a = cityAlert(season, weather)
  const Icon = season === 'sardi' ? Flame : Sun
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? 'text-sm' : ''}`}>
      <BandPill band={a.level} />
      <span className="flex items-center gap-1.5 font-medium">
        <Icon className="size-4 text-[var(--accent-600)]" aria-hidden />
        {weatherLoading ? 'Mausam load ho raha hai…' : a.text}
      </span>
      {!compact && weather.pm25 != null && (
        <span className="text-ink-2 tabular">PM2.5 {Math.round(weather.pm25)} µg/m³</span>
      )}
      <span className="text-xs text-ink-3">
        {weather.label}
        {weather.date ? ` · ${weather.date}` : ''}
      </span>
      {weatherError && <span className="text-xs text-critical">{weatherError}</span>}
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular ${tone ?? ''}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-3">{sub}</div>}
    </div>
  )
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-card ${className ?? ''}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function SourceTag({ source }: { source: string }) {
  const style =
    source === 'synthetic' || source === 'demo'
      ? 'border-dashed border-ink-3 text-ink-3'
      : 'border-line text-ink-2'
  const text = source === 'osm-anchored' ? 'OSM' : source === 'synthetic' ? 'synthetic' : source === 'demo' ? 'demo' : source
  return <span className={`rounded border px-1 text-[10px] uppercase tracking-wide ${style}`}>{text}</span>
}

export const inr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`
