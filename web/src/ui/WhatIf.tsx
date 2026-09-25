/**
 * "What if we do this?" (Brief 2, section 5). Tick shade, a hedge, stopping burning or watering
 * the road, and see Now next to After. Every After is a range, labelled Estimated, with the
 * source on tap. Used in the Where to plant drawer and on the Heat and Air panels.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { WHATIF } from '../i18n/whatif'
import { longDate } from '../lib/ist'
import { loadReplay, type Loaded } from '../lib/live'
import { snapCityFor } from '../lib/place'
import type { Point } from '../lib/points'
import type { Day } from '../lib/risk'
import { loadSummerDay } from '../lib/snapshot'
import { airWhatIf, heatWhatIf, LEVERS, peopleHelped, pickHeatDay, STARTS, type Lever, type Range } from '../lib/whatif'
import { AqiGauge } from './AirPanel'
import { DemoTag, Src } from './atoms'
import { DayStrip } from './DayStrip'

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

/** Counts up to `value` once, when it first appears (skipped with reduced motion). */
function CountUp({ value, digits = 0 }: { value: number; digits?: number }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0))
  const done = useRef(false)
  useEffect(() => {
    if (done.current || reducedMotion()) {
      setShown(value)
      return
    }
    done.current = true
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      setShown(value * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className="tabular">{shown.toFixed(digits)}</span>
}

/** Last summer's hottest day at this place: live archive, else the copy saved in the app. */
function useHottest(enabled: boolean): { day: Day | null; done: boolean } {
  const { place } = useApp()
  const key = `${place.lat},${place.lon}`
  const [r, setR] = useState<{ key: string; l: Loaded | null } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let off = false
    const snap = snapCityFor(place)
    loadReplay('summer', place.lat, place.lon)
      .catch(() => (snap ? loadSummerDay(snap) : null))
      .then((l) => !off && setR({ key, l: l ?? null }))
      .catch(() => !off && setR({ key, l: null }))
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return r?.key === key ? { day: r.l?.data.days[0] ?? null, done: true } : { day: null, done: false }
}

function RangeText({ r, digits = 0 }: { r: Range; digits?: number }) {
  const { lang, f } = useI18n()
  const w = WHATIF[lang]
  const lo = Number(Math.min(...r).toFixed(digits))
  const hi = Number(Math.max(...r).toFixed(digits))
  // a range whose ends agree is still a range: say so instead of printing one bare number
  if (lo === hi) return <span>{f(w.either, { n: lo.toFixed(digits) })}</span>
  return (
    <span className="tabular">
      <CountUp value={lo} digits={digits} />–<CountUp value={hi} digits={digits} />
    </span>
  )
}

function NowAfter({ label, now, after, sub }: { label: string; now: React.ReactNode; after: React.ReactNode; sub?: React.ReactNode }) {
  const { lang } = useI18n()
  const w = WHATIF[lang]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-0.5 py-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <span className="text-right">
        <span className="block text-[11px] text-muted">{w.now}</span>
        <b className="num text-xl">{now}</b>
      </span>
      <span className="rounded-md bg-[#1E9E5A]/10 px-2 py-0.5 text-right">
        <span className="block text-[11px] text-muted">{w.after}</span>
        <b className="num text-xl">{after}</b>
      </span>
      {sub && <span className="col-span-3 text-xs text-muted">{sub}</span>}
    </div>
  )
}

export function WhatIf({
  focus, day, point, onAqiAfter, gauge,
}: {
  focus: 'heat' | 'air'
  /** the day being shown (hourly feels, PM2.5, PM10, AQI) */
  day: Day
  /** the spot; null = city level (a sunny waiting spot by a busy road) */
  point: Point | null
  /** the AQI range after the hedge, for a parent that draws it on its own gauge */
  onAqiAfter?: (r: Range | null) => void
  /** draw a gauge here; by default only on the heat side, where there is no Air panel gauge */
  gauge?: boolean
}) {
  const { lang, f } = useI18n()
  const w = WHATIF[lang]
  const [on, setOn] = useState<Set<Lever>>(() => new Set<Lever>(focus === 'heat' ? ['canopy'] : ['hedge', 'burning']))
  const levers = LEVERS.filter((l) => on.has(l))
  const shade = on.has('trees') || on.has('canopy')
  const hottest = useHottest(shade)
  const pick = useMemo(() => (shade ? pickHeatDay(day, hottest.day) : null), [shade, day, hottest.day])
  const heat = useMemo(() => (pick ? heatWhatIf(pick.day, point?.shadeNow ?? 'none') : null), [pick, point?.shadeNow])
  const air = useMemo(() => (on.has('hedge') ? airWhatIf(day, point?.street) : null), [on, day, point?.street])
  const aqiAfter = air?.aqiAfter ?? null
  const people = peopleHelped(point, levers)
  const showGauge = gauge ?? focus === 'heat'

  useEffect(() => {
    onAqiAfter?.(aqiAfter)
    // report the range only when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aqiAfter?.[0], aqiAfter?.[1]])

  const toggle = (l: Lever) =>
    setOn((s) => {
      const n = new Set(s)
      if (n.has(l)) n.delete(l)
      else n.add(l)
      return n
    })

  const heatBlock = shade && (
    <section className="space-y-2" aria-live="polite">
      <h4 className="font-display text-base font-bold">{w.heat}</h4>
      {!pick ? (
        <p className="text-sm text-muted">{hottest.done ? w.noHeat : w.loading}</p>
      ) : heat && heat.before === 0 ? (
        <p className="text-sm">{w.noHeat}</p>
      ) : (
        heat && (
          <>
            <Src text={w.heatTip}>
              <span className="text-sm">{f(w.heatLine, { lo: heat.drop[0], hi: heat.drop[1] })}</span>
            </Src>
            <NowAfter
              label={`${w.dangerous} ${pick.source === 'summer' ? f(w.onSummer, { date: longDate(pick.day.date, lang) }) : w.onShown}`}
              now={<CountUp value={heat.before} />}
              after={<RangeText r={heat.after} />}
            />
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted">{w.now}</div>
              <DayStrip day={pick.day} shift="day" nowHour={null} selected={null} onSelect={() => {}} height="h-9" hint={false} />
              <div className="text-xs font-semibold text-muted">{w.stripAfter}</div>
              <DayStrip day={heat.middle} shift="day" nowHour={null} selected={null} onSelect={() => {}} height="h-9" hint={false} />
            </div>
          </>
        )
      )}
    </section>
  )

  const airBlock = (on.has('hedge') || on.has('burning') || on.has('water')) && (
    <section className="space-y-2" aria-live="polite">
      <h4 className="font-display text-base font-bold">{w.air}</h4>
      {on.has('hedge') &&
        (!air ? (
          <p className="text-sm text-muted">{w.noAir}</p>
        ) : (
          <>
            <p className="text-sm">
              {f(w.hedgeLine, { lo: Math.round(air.cut[0] * 100), hi: Math.round(air.cut[1] * 100) })}
              {point?.street === 'narrow' && <span className="block text-muted">{w.narrow}</span>}
            </p>
            <div className="divide-y divide-line/70">
              <NowAfter
                label={`${w.pm10}, ${w.unit}`}
                now={<CountUp value={Math.round(air.pm10)} />}
                after={<RangeText r={air.pm10After} />}
              />
              <NowAfter label={`${w.pm25}, ${w.unit}`} now={<CountUp value={Math.round(air.pm25)} />} after={<span className="text-sm font-semibold text-muted italic">{w.mayNot}</span>} />
              {air.aqi <= 50 ? (
                // already "Good": neither an AQI range nor "stop burning" is the useful message
                <p className="py-1.5 text-sm">{f(w.clean, { lo: Math.round(air.cut[0] * 100), hi: Math.round(air.cut[1] * 100) })}</p>
              ) : air.aqiAfter ? (
                <NowAfter label={w.aqi} now={<CountUp value={air.aqi} />} after={<RangeText r={air.aqiAfter} />} />
              ) : (
                <p className="py-1.5 text-sm font-semibold">{w.pm25Main}</p>
              )}
            </div>
            {showGauge && (
              <div className="flex justify-center">
                <AqiGauge aqi={air.aqi} label={w.aqi} after={air.aqiAfter ?? undefined} />
              </div>
            )}
          </>
        ))}
      {on.has('burning') && <p className="text-sm font-semibold">{w.burning}</p>}
      {on.has('water') && <p className="text-sm font-semibold">{w.water}</p>}
    </section>
  )

  return (
    <section className="space-y-3 rounded-xl border border-line p-3 sm:p-4" aria-label={w.title}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-bold">{w.title}</h3>
        <Src text={w.source}>
          <DemoTag label={w.estimated} />
        </Src>
      </div>

      <fieldset>
        <legend className="sr-only">{w.title}</legend>
        <div className="flex flex-wrap gap-1.5">
          {LEVERS.map((l) => (
            <label key={l} data-on={on.has(l) ? 'true' : undefined} className="chip cursor-pointer !py-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#1f6feb] has-[:focus-visible]:ring-offset-2">
              <input type="checkbox" className="sr-only" checked={on.has(l)} onChange={() => toggle(l)} />
              <span aria-hidden className={`inline-block size-3 rounded-sm border ${on.has(l) ? 'border-white bg-white' : 'border-muted'}`} />
              {w.levers[l]}
            </label>
          ))}
        </div>
      </fieldset>

      {!levers.length ? (
        <p className="text-sm text-muted">{w.pick}</p>
      ) : (
        <div className="space-y-4">
          {focus === 'air' ? (
            <>
              {airBlock}
              {heatBlock}
            </>
          ) : (
            <>
              {heatBlock}
              {airBlock}
            </>
          )}

          <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <div className="text-sm">
              {people != null ? (
                <>
                  <div className="font-semibold text-muted">{w.people}</div>
                  <b className="num text-2xl">
                    <CountUp value={people} />
                  </b>
                </>
              ) : (
                <p className="text-muted">{w.city}</p>
              )}
            </div>
            <div className="text-sm">
              <div className="font-semibold text-muted">{w.timeTitle}</div>
              <ul>
                {levers.map((l) => (
                  <li key={l}>{w.time[STARTS[l]!]}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      <p className="text-sm font-semibold">{w.note}</p>
    </section>
  )
}
