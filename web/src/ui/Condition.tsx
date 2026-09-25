import { CloudFog, Flame, Snowflake, Sprout, Sun, ThermometerSun, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { hourLabel, weekday } from '../lib/ist'
import {
  climateOf, COND_COLOR, coldSpan, dayLevel, heatSpan, LEVEL_COLOR, MODE_TINT, plantingNow, worstAirSpan,
  type Condition, type ConditionInfo, type Day, type Mode, type Need, type Span,
} from '../lib/risk'
import { ICON, WxIcon } from './atoms'

/** Solid colours dark enough for white text (AA); "warm" (yellow) and Poor air (CPCB orange) use ink text. */
const BG: Record<Condition, string> = {
  mild: '#157a45', warm: '#E0B000', hot: '#b01f33', air: '#F07F13', cold: '#2f5bb8', double: '#b01f33',
}
const VERY_POOR = '#b01f33'
const ICONS: Record<Condition, LucideIcon> = { mild: Sun, warm: ThermometerSun, hot: ThermometerSun, air: CloudFog, cold: Snowflake, double: Flame }

/** What to do first under each screen. */
export const COND_NEEDS: Record<Condition, Need[]> = {
  mild: [],
  warm: ['water_ors', 'shade_breaks'],
  hot: ['shade', 'water_ors', 'work_hours'],
  air: ['masks', 'stop_burning', 'water_roads'],
  cold: ['warm_kit', 'heater_check', 'shelter_ride', 'no_fines'],
  double: ['masks', 'shade', 'water_ors'],
}

export function spanOf(info: ConditionInfo, day: Day, next?: Day): Span | null {
  switch (info.cond) {
    case 'warm':
      return heatSpan(day, 1)
    case 'hot':
    case 'double':
      return heatSpan(day, 2)
    case 'cold':
      return coldSpan(day, next, 2)
    case 'air':
      return worstAirSpan(day)
    default:
      return null
  }
}

export function ConditionBanner({ info, day, next }: { info: ConditionInfo; day: Day; next?: Day }) {
  const { t, f, lang } = useI18n()
  const { place, wx, startDate } = useApp()
  const { search } = useLocation()
  const c = info.cond
  const I = ICONS[c]
  const span = spanOf(info, day, next)
  // the brief's sentence first, then when (the hours come from the forecast)
  const hours = c === 'mild' ? '' : span ? f(t.cond.line[c], { from: hourLabel(span.from, lang), to: hourLabel(span.to, lang) }) : t.cond.noSpan
  const veryPoor = c === 'air' && info.hz.air >= 3
  const ink = c === 'warm' || (c === 'air' && !veryPoor)
  const climate = climateOf(wx?.data.elevation, place.pilot)
  const month = Number((day.date || startDate).slice(5, 7))
  const plantOk = plantingNow(month, climate)
  const bg =
    c === 'double'
      ? `linear-gradient(100deg, ${BG.hot} 0 50%, ${info.hz.air >= 3 ? '#7a1020' : '#a84f00'} 50% 100%)`
      : veryPoor ? VERY_POOR : BG[c]
  return (
    <section className="rounded-xl p-4 sm:p-5" style={{ background: bg, color: ink ? '#1b2330' : '#fff' }} aria-live="polite">
      <div className="flex flex-wrap items-start gap-3">
        <I className="mt-0.5 size-8 shrink-0" {...ICON} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl leading-tight font-bold sm:text-[28px]">{veryPoor ? t.cond.veryPoor : t.cond.title[c]}</h2>
          <p className="mt-1 text-[17px] leading-snug font-semibold">{t.cond.action[c]}</p>
          {hours && <p className="mt-0.5 text-[15px] leading-snug font-semibold opacity-95">{hours}</p>}
          {info.also.length > 0 && (
            <p className="mt-1 text-sm font-semibold opacity-90">{f(t.cond.also, { what: info.also.map((h) => t.cond.hazard[h]).join(', ') })}</p>
          )}
        </div>
        {(c === 'mild' || c === 'warm') && plantOk && (
          <Link
            to={{ pathname: '/plant', search }}
            className="flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-sm font-bold text-[#157a45] shadow-sm hover:bg-white"
          >
            <Sprout className="size-4" {...ICON} aria-hidden /> {t.cond.plantNow} · {t.cond.seePlant}
          </Link>
        )}
      </div>
      {c === 'cold' && climate === 'cold_desert' && !plantOk && (
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
          <Sprout className="size-4" {...ICON} aria-hidden /> {t.cond.plantLater}
        </p>
      )}
      {COND_NEEDS[c].length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-bold">{t.cond.doNow}:</span>
          {COND_NEEDS[c].map((n) => (
            <span key={n} className="rounded-full px-2.5 py-0.5 text-sm font-semibold" style={{ background: ink ? 'rgb(255 255 255 / .55)' : 'rgb(255 255 255 / .18)' }}>
              {t.needs.items[n][0]}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Chips for the day's modes. A hot afternoon ("Be careful" heat) is below the Heat mode rule,
 * so on a "mild" day the chip follows the screen instead, and the two never disagree.
 */
export function modeChips(modes: Mode[], cond: Condition, t: { mode: Record<Mode, string>; cond: { short: Record<Condition, string> } }) {
  if (modes[0] === 'mild' && cond !== 'mild') return [{ key: cond, label: t.cond.short[cond], color: COND_COLOR[cond] }]
  return modes.map((m) => ({ key: m, label: t.mode[m], color: MODE_TINT[m] }))
}

/** The next five days as small cards, with the trend line under them. */
export function FiveDay({ days, trend }: { days: Day[]; trend: string | null }) {
  const { t, f, lang } = useI18n()
  if (days.length < 3) return null
  return (
    <section aria-label={t.five.title}>
      <h3 className="mb-2 text-sm font-semibold text-muted">{t.five.title}</h3>
      <ol className="grid grid-cols-5 gap-1.5">
        {days.slice(0, 5).map((d) => {
          const l = dayLevel(d)
          return (
            <li key={d.date} className="rounded-lg border border-line bg-paper px-1.5 py-2 text-center" title={f(t.five.worst, { level: t.level[l] })}>
              <div className="truncate text-xs font-semibold" title={weekday(d.date, lang)}>
                {new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(d.date + 'T00:00:00Z'))}
              </div>
              <WxIcon code={d.code} className="mx-auto my-1 size-5" />
              <div className="text-sm tabular">
                <b>{Math.round(d.tmax)}°</b> <span className="text-muted">{Math.round(d.tmin)}°</span>
              </div>
              <div className="mx-auto mt-1 h-1.5 w-8 rounded-full" style={{ background: LEVEL_COLOR[l] }} aria-hidden />
              <span className="sr-only">{f(t.five.worst, { level: t.level[l] })}</span>
            </li>
          )
        })}
      </ol>
      {trend && <p className="mt-2 text-sm font-semibold">{trend}</p>}
    </section>
  )
}
