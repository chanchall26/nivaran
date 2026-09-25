import { Navigation, Square, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useDay } from '../ctx'
import { useI18n } from '../i18n'
import { km } from '../lib/place'
import { conditionOf, dayLevel, hourLevel, inShift, type Shift } from '../lib/risk'
import { taskStore, type AskNeed } from '../lib/tasks'
import { ICON, Skel, Src } from '../ui/atoms'
import { DayStrip } from '../ui/DayStrip'
import { COND_EMOJI, Emoji } from '../ui/Emoji'
import { useLinkTo } from './panels'
import { pointName, useNowHour } from './shared'
import { DayTabs, ShiftSwitch } from './Today'

/** Web Speech: the device's Hindi / English (India) voice when it has one; else the browser picks by language. */
function useVoice(lang: 'en' | 'hi') {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const pick = () => {
      const vs = speechSynthesis.getVoices()
      const want = lang === 'hi' ? 'hi' : 'en-IN'
      setVoice(vs.find((v) => v.lang.replace('_', '-').startsWith(want)) ?? (lang === 'en' ? vs.find((v) => v.lang.startsWith('en')) ?? null : null))
    }
    pick()
    speechSynthesis.addEventListener('voiceschanged', pick)
    return () => speechSynthesis.removeEventListener('voiceschanged', pick)
  }, [lang])
  return voice
}

function ReadAloud({ text }: { text: string }) {
  const { t, lang } = useI18n()
  const voice = useVoice(lang)
  const [on, setOn] = useState(false)
  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const toggle = () => {
    if (on) {
      speechSynthesis.cancel()
      setOn(false)
      return
    }
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? (lang === 'hi' ? 'hi-IN' : 'en-IN')
    u.rate = 0.95
    u.onend = () => setOn(false)
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
    setOn(true)
  }
  return (
    <button type="button" className="btn btn-line" onClick={toggle} aria-pressed={on}>
      {on ? <Square className="size-5" {...ICON} aria-hidden /> : <Volume2 className="size-5" {...ICON} aria-hidden />}
      {on ? t.worker.stop : t.worker.readAloud}
    </button>
  )
}

export function WorkerToday() {
  const { profile, wx, dayIdx, wxStatus, refresh } = useApp()
  const { day, next, modes } = useDay()
  const { t, f } = useI18n()
  const nowHour = useNowHour(dayIdx)
  const [shift, setShift] = useState<Shift>(profile?.shift ?? 'day')
  const [sel, setSel] = useState<number | null>(null)
  const to = useLinkTo()

  if (!day && wxStatus === 'error')
    return (
      <section className="panel p-5">
        <p className="font-semibold">{t.picker.netErr}</p>
        <button type="button" className="btn btn-ink mt-3" onClick={refresh}>
          {t.app.tryAgain}
        </button>
        <p className="mt-4 font-semibold">{t.worker.emergency}</p>
      </section>
    )
  if (!day)
    return (
      <div className="space-y-4">
        <Skel className="h-56 w-full rounded-xl" />
        <Skel className="h-40 w-full rounded-xl" />
      </div>
    )
  const shiftHours = day.hours.filter((h) => inShift(h.hour, shift))
  const level = shiftHours.length ? (Math.max(...shiftHours.map(hourLevel)) as ReturnType<typeof dayLevel>) : dayLevel(day)
  const feels = dayIdx === 0 && wx ? Math.round(wx.data.current.feels) : Math.round(shift === 'night' ? day.fmin : day.fmax)
  // advice follows the day's screen: a hot afternoon is heat advice even on a "mild" mode day
  const cond = conditionOf(day, next).cond
  const advice =
    cond === 'warm' || cond === 'hot' ? t.worker.advice.heat
    : cond === 'double' ? `${t.worker.advice.heat} ${t.worker.advice.smoky}`
    : cond === 'air' ? t.worker.advice.smoky
    : cond === 'cold' ? t.worker.advice.cold
    : cond === 'rain' ? t.worker.advice.rain
    : t.worker.advice[modes[0]]
  const headline = f(dayIdx === 0 ? t.worker.todayOutside : t.worker.tomorrowOutside, { level: t.level[level] })
  const dark = level < 3
  // level colours as gradients; ink text on green, yellow and orange, white on red (AA)
  const LEVEL_GRAD = [
    'linear-gradient(135deg, #4ade80 0%, #2dd4bf 100%)',
    'linear-gradient(135deg, #fbbf24 0%, #fde68a 100%)',
    'linear-gradient(135deg, #fb923c 0%, #fbbf24 100%)',
    'linear-gradient(135deg, #b91c1c 0%, #be123c 100%)',
  ]
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DayTabs />
      </div>
      <section
        className="rise relative isolate overflow-hidden rounded-[26px] p-5 shadow-[0_18px_40px_-20px_rgb(30_27_75/0.55)] sm:p-7"
        style={{ background: LEVEL_GRAD[level], color: dark ? '#1e1b4b' : '#fff' }}
      >
        <span aria-hidden className="pointer-events-none absolute -top-16 -right-12 -z-10 size-56 rounded-full bg-white/25 blur-2xl" />
        <span aria-hidden className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <Emoji name={COND_EMOJI[cond]} size={72} float eager />
        </span>
        <h1 className="plain pr-20 font-display text-3xl leading-tight font-extrabold sm:text-4xl">{headline}</h1>
        <div className="mt-3 flex items-end gap-3">
          <Src kind="live">
            <span className="num text-[64px] font-bold">{feels}°</span>
          </Src>
          <span className="pb-2 text-lg font-semibold">{t.today.feels}</span>
        </div>
        <p className="mt-2 text-xl leading-snug font-semibold">{advice}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ReadAloud text={`${headline}. ${t.today.feels} ${feels}°. ${advice}`} />
        </div>
      </section>

      <section className="panel p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">{t.worker.yourShift}</h2>
          <ShiftSwitch value={shift} onChange={(s) => s !== 'all' && setShift(s)} withAll={false} />
        </div>
        <DayStrip day={day} shift={shift} nowHour={nowHour} selected={sel} onSelect={(h) => setSel(sel === h ? null : h)} height="h-20" />
      </section>

      <NearList limit={3} />

      <Link to={to('/ask')} className="btn btn-ink w-full !min-h-16 !rounded-2xl text-xl">
        <Emoji name="megaphone" size={34} pop /> {t.worker.ask}
      </Link>
      <p className="flex items-center justify-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-center font-semibold ring-1 ring-line">
        <Emoji name="ambulance" size={28} /> {t.worker.emergency}
      </p>
    </div>
  )
}

export function NearList({ limit = 10 }: { limit?: number }) {
  const { place, pts } = useApp()
  const { t, f, lang } = useI18n()
  const near = useMemo(
    () =>
      (pts.points ?? [])
        .filter((p) => p.offers?.length)
        .map((p) => ({ p, d: km(place.lat, place.lon, p.lat, p.lon) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, limit),
    [pts.points, place.lat, place.lon, limit],
  )
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="mb-3 font-display text-xl font-bold">{t.worker.near}</h2>
      {pts.status === 'loading' ? (
        <Skel className="h-24 w-full" />
      ) : !near.length ? (
        <p className="text-muted">{t.worker.noneNear}</p>
      ) : (
        <ul className="divide-y divide-line">
          {near.map(({ p, d }) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{pointName(p, lang)}</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {p.offers!.map((o) => (
                    <span key={o} className="chip !text-xs">
                      {t.worker.offers[o]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-2xl font-bold">{d < 10 ? d.toFixed(1) : Math.round(d)}</div>
                <div className="text-xs text-muted">{f(t.worker.away, { d: '' }).replace(/^\s+/, '')}</div>
              </div>
              <a
                className="btn btn-line btn-sm !px-2.5"
                href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`${t.worker.directions}: ${pointName(p, lang)}`}
              >
                <Navigation className="size-5" {...ICON} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function NearScreen() {
  return <NearList limit={10} />
}

const ASK: AskNeed[] = ['water', 'shade', 'warm', 'heater', 'shelter', 'medical', 'other']

export function AskScreen() {
  const { place, profile } = useApp()
  const { t, f, lang } = useI18n()
  const [need, setNeed] = useState<AskNeed | null>(null)
  const [where, setWhere] = useState(lang === 'hi' ? place.nameHi : place.name)
  const [sent, setSent] = useState<string | null>(null)
  if (sent)
    return (
      <section className="panel p-6 text-center" role="status">
        <p className="font-display text-2xl font-bold">{f(t.worker.sent, { id: sent })}</p>
        <p className="mt-2 text-muted">{t.worker.sentNote}</p>
        <p className="mt-4 font-semibold">{t.worker.emergency}</p>
        <button type="button" className="btn btn-line mt-4" onClick={() => (setSent(null), setNeed(null))}>
          {t.worker.ask}
        </button>
      </section>
    )
  return (
    <form
      className="panel space-y-5 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!need) return
        const r = taskStore.ask({ need, place: where, lat: place.lat, lon: place.lon, work: profile?.work })
        setSent(`B-${r.id.slice(0, 4).toUpperCase()}`)
      }}
    >
      <h1 className="font-display text-2xl font-bold">{t.worker.ask}</h1>
      <p className="font-semibold">{t.entry.noName}</p>
      <fieldset>
        <legend className="label text-lg">{t.worker.askTitle}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ASK.map((n) => (
            <button key={n} type="button" aria-pressed={need === n} onClick={() => setNeed(n)} className={`btn ${need === n ? 'btn-ink' : 'btn-line'} !min-h-14 text-lg`}>
              {t.worker.askNeeds[n]}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="label text-lg">{t.worker.askPlace}</span>
        <input className="field" value={where} onChange={(e) => setWhere(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-ink w-full !min-h-14 text-xl" disabled={!need}>
        {t.worker.send}
      </button>
      <p className="text-center font-semibold">{t.worker.emergency}</p>
    </form>
  )
}
