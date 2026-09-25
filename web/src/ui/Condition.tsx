import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { hourLabel, weekday } from '../lib/ist'
import {
  climateOf, COND_COLOR, coldSpan, dayLevel, heatSpan, LEVEL_COLOR, MODE_TINT, plantingNow, rainSpan, worstAirSpan,
  type Condition, type ConditionInfo, type Day, type Mode, type Need, type Span,
} from '../lib/risk'
import { COND_EMOJI, Emoji, wxEmoji } from './Emoji'

/**
 * Gradients dark enough for white text (AA) across their whole length; "warm" (yellow) and
 * Poor air (CPCB orange) are light, so they carry ink text.
 */
const BG: Record<Condition, string> = {
  mild: 'linear-gradient(120deg, #15803d 0%, #0f766e 100%)',
  warm: 'linear-gradient(120deg, #f59e0b 0%, #fbbf24 100%)',
  hot: 'linear-gradient(120deg, #b91c1c 0%, #c2410c 100%)',
  air: 'linear-gradient(120deg, #ea580c 0%, #f59e0b 100%)',
  cold: 'linear-gradient(120deg, #1d4ed8 0%, #4338ca 100%)',
  double: 'linear-gradient(100deg, #b91c1c 0 50%, #9a3412 50% 100%)',
  rain: 'linear-gradient(120deg, #3730a3 0%, #0369a1 100%)',
}
const VERY_POOR = 'linear-gradient(120deg, #991b1b 0%, #b91c1c 100%)'

/** What to do first under each screen. */
export const COND_NEEDS: Record<Condition, Need[]> = {
  mild: [],
  warm: ['water_ors', 'shade_breaks'],
  hot: ['shade', 'water_ors', 'work_hours'],
  air: ['masks', 'stop_burning', 'water_roads'],
  cold: ['warm_kit', 'heater_check', 'shelter_ride', 'no_fines'],
  double: ['masks', 'shade', 'water_ors'],
  rain: ['sheet', 'dry_sleep', 'flood_roads'],
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
    case 'rain':
      return rainSpan(day)
    default:
      return null
  }
}

export function ConditionBanner({ info, day, next }: { info: ConditionInfo; day: Day; next?: Day }) {
  const { t, f, lang } = useI18n()
  const { place, wx, startDate } = useApp()
  const { search } = useLocation()
  const c = info.cond
  const span = spanOf(info, day, next)
  // the brief's sentence first, then when (the hours come from the forecast)
  const hours = c === 'mild' ? '' : span ? f(t.cond.line[c], { from: hourLabel(span.from, lang), to: hourLabel(span.to, lang) }) : t.cond.noSpan
  const veryPoor = c === 'air' && info.hz.air >= 3
  const ink = c === 'warm' || (c === 'air' && !veryPoor)
  const climate = climateOf(wx?.data.elevation, place.pilot)
  const month = Number((day.date || startDate).slice(5, 7))
  const plantOk = plantingNow(month, climate)
  const bg = c === 'double' && info.hz.air >= 3 ? 'linear-gradient(100deg, #b91c1c 0 50%, #7a1020 50% 100%)' : veryPoor ? VERY_POOR : BG[c]
  return (
    <section
      className="rise relative isolate overflow-hidden rounded-[26px] p-5 shadow-[0_18px_40px_-20px_rgb(30_27_75/0.55)] transition-[background] duration-200 sm:p-6"
      style={{ background: bg, color: ink ? '#1e1b4b' : '#fff' }}
      aria-live="polite"
    >
      {/* soft light spots, and the day's 3D emoji */}
      <span aria-hidden className="pointer-events-none absolute -top-16 -right-10 -z-10 size-56 rounded-full bg-white/20 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 -z-10 size-48 rounded-full bg-white/10 blur-2xl" />
      <div className="flex flex-wrap items-start gap-4">
        <span className="relative grid size-16 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/40 backdrop-blur-sm sm:size-20">
          <Emoji name={COND_EMOJI[c]} size={52} float eager />
          {c === 'double' && <Emoji name="mask" size={30} className="absolute -right-2 -bottom-2" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl leading-tight font-extrabold sm:text-[30px]">{veryPoor ? t.cond.veryPoor : t.cond.title[c]}</h2>
          <p className="mt-1 text-[17px] leading-snug font-semibold">{t.cond.action[c]}</p>
          {hours && <p className="mt-0.5 text-[15px] leading-snug font-semibold opacity-95">{hours}</p>}
          {info.also.length > 0 && (
            <p className="mt-1 text-sm font-semibold opacity-90">{f(t.cond.also, { what: info.also.map((h) => t.cond.hazard[h]).join(', ') })}</p>
          )}
        </div>
        {(c === 'mild' || c === 'warm' || c === 'rain') && plantOk && (
          <Link
            to={{ pathname: '/plant', search }}
            className="lift flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-bold text-[#157a45] shadow-lg"
          >
            <Emoji name="seedling" size={22} pop /> {t.cond.plantNow} · {t.cond.seePlant}
          </Link>
        )}
      </div>
      {c === 'cold' && climate === 'cold_desert' && !plantOk && (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <Emoji name="seedling" size={22} /> {t.cond.plantLater}
        </p>
      )}
      {COND_NEEDS[c].length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{t.cond.doNow}:</span>
          {COND_NEEDS[c].map((n, i) => (
            <span
              key={n}
              className={`pop-in rounded-full px-3 py-1 text-sm font-semibold ring-1 backdrop-blur-sm ${ink ? 'bg-white/60 ring-white/70' : 'bg-white/20 ring-white/35'}`}
              style={{ animationDelay: `${150 + i * 80}ms` }}
            >
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
            <li key={d.date} className="lift rounded-2xl border border-line bg-gradient-to-b from-white to-violet-50/60 px-1.5 py-2.5 text-center" title={f(t.five.worst, { level: t.level[l] })}>
              <div className="truncate text-xs font-semibold" title={weekday(d.date, lang)}>
                {new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(d.date + 'T00:00:00Z'))}
              </div>
              <Emoji name={wxEmoji(d.code)} size={34} className="mx-auto my-1" pop />
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
