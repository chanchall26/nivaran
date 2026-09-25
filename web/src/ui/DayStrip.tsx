import { useI18n } from '../i18n'
import { hourLabel } from '../lib/ist'
import { aqiCategory, hourLevel, inShift, LEVEL_COLOR, type Day, type Shift } from '../lib/risk'
import { AqiDot } from './atoms'

/**
 * The hero: 24 tall slim blocks, one per hour, coloured by danger for a person working outside.
 * The shift switch dims the other hours; a thin marker shows "now"; tapping a block shows details.
 */
export function DayStrip({
  day, shift, nowHour, selected, onSelect, height = 'h-28', hint = true,
}: {
  day: Day
  shift: Shift | 'all'
  nowHour: number | null
  selected: number | null
  onSelect: (h: number) => void
  height?: string
  /** "Tap an hour" line under the strip */
  hint?: boolean
}) {
  const { t, lang } = useI18n()
  return (
    <div>
      <div className={`relative ${nowHour != null ? 'mt-6' : ''}`}>
        <ol className={`grid gap-[3px] ${height}`} style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {day.hours.map((h) => {
            const l = hourLevel(h)
            const dim = shift !== 'all' && !inShift(h.hour, shift)
            const sel = selected === h.hour
            return (
              <li key={h.hour} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(h.hour)}
                  aria-pressed={sel}
                  aria-label={`${hourLabel(h.hour, lang)}: ${t.level[l]}, ${t.today.feels} ${Math.round(h.feels)}°`}
                  className={`block h-full w-full rounded-[3px] transition-opacity ${sel ? 'ring-2 ring-ink ring-offset-2' : ''}`}
                  style={{ background: LEVEL_COLOR[l], opacity: dim ? 0.22 : 1 }}
                />
              </li>
            )
          })}
        </ol>
        {nowHour != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-2 -bottom-2 w-0.5 bg-ink"
            style={{ left: `calc(${((nowHour + 0.5) / 24) * 100}% - 1px)` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-ink px-1 text-[10px] font-bold whitespace-nowrap text-white">{t.today.now}</span>
          </div>
        )}
      </div>
      <div className="mt-1.5 grid text-[11px] text-muted tabular" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }} aria-hidden>
        {day.hours.map((h) => (
          <span key={h.hour} className="text-center">
            {h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
      {selected != null && day.hours[selected] && <HourDetail day={day} hour={selected} />}
      {selected == null && hint && <p className="mt-2 text-sm text-muted">{t.today.tapHour}</p>}
    </div>
  )
}

function HourDetail({ day, hour }: { day: Day; hour: number }) {
  const { t, lang } = useI18n()
  const h = day.hours[hour]
  const l = hourLevel(h)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-mist px-3 py-2 text-sm" aria-live="polite">
      <span className="font-bold">{hourLabel(hour, lang)}</span>
      <span className="flex items-center gap-1.5 font-semibold">
        <span className="size-2.5 rounded-full" style={{ background: LEVEL_COLOR[l] }} aria-hidden /> {t.level[l]}
      </span>
      <span>
        {t.today.feels} <b className="tabular">{Math.round(h.feels)}°</b>
      </span>
      <span className="flex items-center gap-1">
        {t.today.air}{' '}
        {h.aqi != null ? (
          <>
            <AqiDot aqi={h.aqi} /> <b>{t.aqi[aqiCategory(h.aqi)]}</b> <span className="text-muted tabular">AQI {h.aqi}</span>
          </>
        ) : (
          <b>–</b>
        )}
      </span>
      <span>
        {t.today.rain} <b className="tabular">{h.rainProb != null ? `${h.rainProb}%` : h.rain > 0 ? `${h.rain.toFixed(1)} mm` : '–'}</b>
      </span>
      <span>
        {t.today.wind} <b className="tabular">{Math.round(h.wind)} km/h</b>
      </span>
    </div>
  )
}
