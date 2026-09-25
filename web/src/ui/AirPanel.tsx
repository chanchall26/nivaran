import { useI18n } from '../i18n'
import { hourLabel } from '../lib/ist'
import { AQI_COLOR, aqiCategory, airProblem, pm10Index, pm25Index, worstAirSpan, type Day } from '../lib/risk'
import { Src } from './atoms'

// CPCB bands on a 0-500 half circle, drawn in proportion to the AQI
const EDGES = [0, 50, 100, 200, 300, 400, 500]
const R = 80
const CX = 100
const CY = 92
const angle = (aqi: number) => Math.PI * (1 - Math.min(500, Math.max(0, aqi)) / 500)
const pt = (a: number, r = R) => [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const

function arc(a0: number, a1: number) {
  const [x0, y0] = pt(a0)
  const [x1, y1] = pt(a1)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** Dark text on the light CPCB colours, white on the dark ones. */
const onAqi = (c: number) => (c >= 4 ? '#fff' : '#1b2330')

/** Band along the inside of the arc, for an "after" range: angles run from `lo` to `hi` AQI. */
function band(lo: number, hi: number, r: number) {
  const [x0, y0] = pt(angle(lo), r)
  const [x1, y1] = pt(angle(hi), r)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** `after`: an estimated AQI range after an action, drawn as a translucent band inside the arc. */
export function AqiGauge({ aqi, label, after }: { aqi: number; label: string; after?: [number, number] }) {
  const { t } = useI18n()
  const cat = aqiCategory(aqi)
  const [nx, ny] = pt(angle(aqi), R - 16)
  return (
    <figure className="w-full max-w-[16rem]">
      <svg viewBox="0 0 200 112" className="w-full" role="img" aria-label={`${label}: AQI ${aqi}, ${t.aqi[cat]}`}>
        {EDGES.slice(1).map((e, i) => (
          <path key={e} d={arc(angle(EDGES[i]), angle(e))} stroke={AQI_COLOR[i]} strokeWidth="18" fill="none" />
        ))}
        {after && (
          <path d={band(Math.min(...after), Math.max(...after), R - 14)} stroke="#1b2330" strokeOpacity="0.28" strokeWidth="9" strokeLinecap="round" fill="none">
            <title>{`${Math.min(...after)}-${Math.max(...after)}`}</title>
          </path>
        )}
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#1b2330" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="6" fill="#1b2330" />
        {[0, 100, 200, 300, 400, 500].map((v) => {
          const [x, y] = pt(angle(v), R + 14)
          return (
            <text key={v} x={x} y={y + 3} textAnchor="middle" fontSize="8" fill="#5b6770">
              {v}
            </text>
          )
        })}
      </svg>
      <figcaption className="-mt-3 text-center">
        <Src kind="model">
          <span className="num text-5xl font-bold">{aqi}</span>
        </Src>
        <div className="mt-1">
          <span className="rounded-full px-2.5 py-0.5 text-sm font-bold" style={{ background: AQI_COLOR[cat], color: onAqi(cat) }}>
            {t.aqi[cat]}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted">{label}</div>
      </figcaption>
    </figure>
  )
}

function PmBar({ label, value, index }: { label: string; value: number; index: number }) {
  const { t, f } = useI18n()
  const cat = aqiCategory(index)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <Src kind="model">
          <span className="tabular">
            <b>{Math.round(value)}</b> µg/m³ · {f(t.air.index, { n: index })}
          </span>
        </Src>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-mist">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (index / 500) * 100)}%`, background: AQI_COLOR[cat] }} />
      </div>
    </div>
  )
}

/** 24 blocks, one per hour, in the CPCB category colour of that hour's AQI. */
export function AirStrip({ day }: { day: Day }) {
  const { t, lang } = useI18n()
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted">{t.air.strip}</div>
      <ol className="grid h-6 gap-[2px]" style={{ gridTemplateColumns: `repeat(${day.hours.length}, minmax(0, 1fr))` }}>
        {day.hours.map((h) => (
          <li
            key={h.hour}
            className="rounded-[2px]"
            title={`${hourLabel(h.hour, lang)}: ${h.aqi != null ? `AQI ${h.aqi}, ${t.aqi[aqiCategory(h.aqi)]}` : '–'}`}
            style={{ background: h.aqi != null ? AQI_COLOR[aqiCategory(h.aqi)] : '#e2e6e9' }}
          />
        ))}
      </ol>
      <div className="mt-0.5 grid text-[10px] text-muted tabular" style={{ gridTemplateColumns: `repeat(${day.hours.length}, minmax(0, 1fr))` }} aria-hidden>
        {day.hours.map((h) => (
          <span key={h.hour} className="text-center">
            {h.hour % 6 === 0 ? String(h.hour).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Indian AQI for the day being shown: gauge, PM2.5 and PM10, what the real problem is, worst hours. */
export function AirPanel({ day, now, after }: { day: Day; now?: { aqi: number; pm25: number; pm10: number } | null; after?: [number, number] | null }) {
  const { t, f, lang } = useI18n()
  const pm25 = avg(day.hours.map((h) => h.pm25))
  const pm10 = avg(day.hours.map((h) => h.pm10))
  if (day.aqi == null || pm25 == null || pm10 == null) return <p className="text-sm text-muted">{t.air.none}</p>
  // on a clean day there is no "problem" and no "worst hours" worth naming
  const bad = day.aqi > 100
  const problem = bad ? airProblem(pm25, pm10) : null
  const worst = bad ? worstAirSpan(day) : null
  return (
    <div className="grid gap-4 sm:grid-cols-[16rem_1fr] sm:items-center">
      <div className="flex flex-col items-center">
        <AqiGauge aqi={day.aqi} label={t.air.day} after={after ?? undefined} />
        {now && Number.isFinite(now.aqi) && (
          <p className="mt-1 text-sm">
            {t.air.now}: <b className="tabular">AQI {now.aqi}</b> · {t.aqi[aqiCategory(now.aqi)]}
          </p>
        )}
      </div>
      <div className="space-y-3">
        <PmBar label={t.air.pm25} value={pm25} index={pm25Index(pm25) ?? 0} />
        <PmBar label={t.air.pm10} value={pm10} index={pm10Index(pm10) ?? 0} />
        {problem && (
          <div>
            <span className="chip font-bold">{t.air.problem[problem]}</span>
            <p className="mt-1 text-sm text-muted">{t.air.problemWhy[problem]}</p>
          </div>
        )}
        <AirStrip day={day} />
        {worst && <p className="text-sm font-semibold">{f(t.air.worst, { from: hourLabel(worst.from, lang), to: hourLabel(worst.to, lang) })}</p>}
        <p className="text-xs text-muted">{t.air.usNote}</p>
      </div>
    </div>
  )
}
