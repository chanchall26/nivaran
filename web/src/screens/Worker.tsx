import { ArrowRight, ChevronRight, Droplet, HardHat, House, Leaf, MapPin, MessageSquareText, Moon, Navigation, PhoneCall, Plus, Square, Sun, Volume2 } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useDay } from '../ctx'
import { useI18n } from '../i18n'
import { LOOK } from '../i18n/look'
import { UI } from '../i18n/ui'
import { hourLabel } from '../lib/ist'
import { km, pilotFor, placeFromGps, reverseGeocode } from '../lib/place'
import { loadHelpNear, type Point } from '../lib/points'
import { aqiCategory, conditionOf, dayLevel, hourLevel, inNcr, inShift, isNightHour, LEVEL_COLOR, rainLikely, rituOf, type Day, type Level, type Shift } from '../lib/risk'
import { taskStore, type AskNeed } from '../lib/tasks'
import { ICON, Skel, Src } from '../ui/atoms'
import { modeChips } from '../ui/Condition'
import { COND_EMOJI, Emoji, wxEmoji } from '../ui/Emoji'
import { HeroMap } from '../ui/HeroMap'
import { SafetyCards } from '../ui/Safety'
import { useLinkTo } from './panels'
import { pointName, useNowHour } from './shared'

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

type RainWord = 'dry' | 'light' | 'lightModerate' | 'moderate' | 'heavy'
/** IMD-style daily amounts: light under 15.6 mm, moderate to 64.4 mm, heavy above. */
function rainWord(d: Day): RainWord {
  if (!rainLikely(d)) return 'dry'
  if (d.rainSum < 2.5) return 'light'
  if (d.rainSum < 15.6) return 'lightModerate'
  if (d.rainSum < 64.5) return 'moderate'
  return 'heavy'
}

/** Status colours as dark tints (white text stays AA), with a bright edge in the level colour. */
const LEVEL_TINT = [
  { bg: 'linear-gradient(135deg, #0b6b3f, #075c36)', edge: 'rgb(74 222 128 / 0.55)', icon: ['#4ade80', '#16a34a'] },
  { bg: 'linear-gradient(135deg, #6b5200, #4d3b00)', edge: 'rgb(250 204 21 / 0.55)', icon: ['#fde047', '#ca8a04'] },
  { bg: 'linear-gradient(135deg, #7c3505, #5c2804)', edge: 'rgb(251 146 60 / 0.6)', icon: ['#fdba74', '#ea580c'] },
  { bg: 'linear-gradient(135deg, #7f1d2d, #5c1420)', edge: 'rgb(248 113 113 / 0.65)', icon: ['#fca5a5', '#dc2626'] },
] as const

/** Air cards take the CPCB category's colour (good green ... severe maroon) as a dark tint, so colour and word agree. */
const AIR_TINT = [
  { edge: 'rgb(22 163 74 / 0.45)', bg: '#06311f', dot: '#14532d', icon: '#4ade80', fill: 'rgb(34 197 94 / 0.3)', text: '#c7f0d6' },
  { edge: 'rgb(132 204 22 / 0.45)', bg: '#1c2e07', dot: '#365314', icon: '#a3e635', fill: 'rgb(163 230 53 / 0.3)', text: '#d9f99d' },
  { edge: 'rgb(234 179 8 / 0.5)', bg: '#2e2606', dot: '#4d3b00', icon: '#facc15', fill: 'rgb(250 204 21 / 0.3)', text: '#fef08a' },
  { edge: 'rgb(249 115 22 / 0.55)', bg: '#331a08', dot: '#5c2804', icon: '#fb923c', fill: 'rgb(251 146 60 / 0.3)', text: '#fed7aa' },
  { edge: 'rgb(239 68 68 / 0.6)', bg: '#3a0d12', dot: '#5c1420', icon: '#f87171', fill: 'rgb(248 113 113 / 0.3)', text: '#fecaca' },
  { edge: 'rgb(190 18 60 / 0.65)', bg: '#3b0a1a', dot: '#4c0519', icon: '#fb7185', fill: 'rgb(251 113 133 / 0.3)', text: '#fecdd3' },
] as const
const AIR_NONE = { edge: '#16325c', bg: '#061a36', dot: '#0e2344', icon: '#93a4c3', fill: 'none', text: '#c7d3ea' }

function ShieldCheck3D({ level, size = 44 }: { level: Level; size?: number }) {
  const [a, b] = LEVEL_TINT[level].icon
  // own gradient id per shield: a copy inside a hidden block would blank the others
  const id = `shield-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg viewBox="0 0 48 52" width={size} height={size * 1.08} aria-hidden className="shrink-0 drop-shadow-[0_6px_12px_rgb(0_0_0/0.5)]">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <path d="M24 2 5 9v14c0 12.4 8.1 22.7 19 27 10.9-4.3 19-14.6 19-27V9L24 2z" fill={`url(#${id})`} />
      <path d="M24 2 5 9v14c0 12.4 8.1 22.7 19 27V2z" fill="#fff" opacity=".12" />
      <path d="m15.5 26 6 6 11-12" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The worker's day as dots on a line: night blue, day amber, now green; a coloured ring = risk that hour. */
function ShiftDots({ day, shift, nowHour, sel, onSel }: { day: Day; shift: Shift; nowHour: number | null; sel: number | null; onSel: (h: number) => void }) {
  const { t, lang } = useI18n()
  const D = LOOK[lang].dash
  const hs = sel != null ? day.hours[sel] : null
  return (
    <div>
      <div className="relative mt-8 h-6">
        <div
          aria-hidden
          className="absolute inset-x-1 top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-80"
          style={{ background: 'linear-gradient(90deg, #1d4ed8 0%, #3b82f6 24%, #f59e0b 36%, #fbbf24 54%, #f59e0b 72%, #334155 80%, #1d4ed8 100%)' }}
        />
        {day.hours.map((h) => {
          const l = hourLevel(h)
          const night = isNightHour(h.hour)
          const isNow = h.hour === nowHour
          const inside = inShift(h.hour, shift)
          const fill = isNow ? '#22c55e' : night ? '#60a5fa' : '#fcd34d'
          const size = isNow ? 18 : 12
          return (
            <button
              key={h.hour}
              type="button"
              onClick={() => onSel(h.hour)}
              aria-pressed={sel === h.hour}
              aria-label={`${hourLabel(h.hour, lang)}: ${t.level[l]}, ${t.today.feels} ${Math.round(h.feels)}°`}
              className="absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
              style={{ left: `${((h.hour + 0.5) / 24) * 100}%`, width: 26, height: 26, opacity: inside || isNow ? 1 : 0.4 }}
            >
              <span
                className={`block rounded-full ${isNow ? 'glow' : ''} ${sel === h.hour ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a1b36]' : ''}`}
                style={{ width: size, height: size, background: fill, boxShadow: l > 0 ? `0 0 0 3px ${LEVEL_COLOR[l]}` : `0 0 10px ${fill}88` }}
              />
              {isNow && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-[#15803d] px-2 py-0.5 text-[12px] font-bold whitespace-nowrap text-white">
                  {t.today.now}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-2 grid text-[14px] text-[#dbe6f7] tabular" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }} aria-hidden>
        {day.hours.map((h) => (
          <span key={h.hour} className="text-center">
            {h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
      {hs ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[#06152d] px-3 py-2 text-sm" aria-live="polite">
          <b>{hourLabel(hs.hour, lang)}</b>
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="size-2.5 rounded-full" style={{ background: LEVEL_COLOR[hourLevel(hs)] }} aria-hidden /> {t.level[hourLevel(hs)]}
          </span>
          <span>
            {t.today.feels} <b className="tabular">{Math.round(hs.feels)}°</b>
          </span>
          {hs.rainProb != null && (
            <span>
              {t.today.rain} <b className="tabular">{hs.rainProb}%</b>
            </span>
          )}
          {hs.aqi != null && (
            <span>
              AQI <b className="tabular">{hs.aqi}</b>
            </span>
          )}
        </p>
      ) : (
        <p className="mt-2 text-[15px] text-[#c7d3ea]">
          {D.tapHour} <span className="sr-only">{D.ringNote}</span>
        </p>
      )}
    </div>
  )
}

function DangerBar() {
  const { t, lang } = useI18n()
  const D = LOOK[lang].dash
  const to = useLinkTo()
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#7f1d3a] bg-[#2a0f1f] px-4 py-2">
      <PhoneCall className="size-6 shrink-0 text-[#f87171]" strokeWidth={1.9} aria-hidden />
      <p className="min-w-0 flex-1 text-[16px]">
        <span className="font-semibold text-[#fb7185]">{D.inDanger}</span> <span className="text-white">{D.callLine}</span>
      </p>
      <Link to={to('/ask')} className="btn btn-ink !min-h-11 !rounded-xl !px-5 text-[16px]">
        <MessageSquareText className="size-5" strokeWidth={2} aria-hidden /> {t.worker.ask}
      </Link>
    </div>
  )
}

const LANDMARK: Record<'gwalior' | 'delhi' | 'leh', { lat: number; lon: number }> = {
  gwalior: { lat: 26.2307, lon: 78.169 },
  delhi: { lat: 28.6129, lon: 77.2295 },
  leh: { lat: 34.1655, lon: 77.5855 },
}

const PIN_SVG =
  '<svg viewBox="0 0 32 40" width="30" height="38" aria-hidden="true" style="display:block;filter:drop-shadow(0 6px 10px rgb(34 197 94 / .55))"><path d="M16 1C8 1 2 7.2 2 15c0 10.2 12.4 22.6 13 23.2a1.4 1.4 0 0 0 2 0C17.6 37.6 30 25.2 30 15 30 7.2 24 1 16 1z" fill="#22c55e"/><circle cx="16" cy="15" r="5.2" fill="#ecfdf5"/></svg>'
const PIN_LINE = (color: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`
const CURSOR_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style="display:block;filter:drop-shadow(0 2px 3px rgb(0 0 0 / .8))"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill="#fff" stroke="#0b1220" stroke-width="1.2"/></svg>'
const FORT_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z"/><path d="M18 11V4H6v7"/><path d="M15 22v-4a3 3 0 0 0-3-3a3 3 0 0 0-3 3v4"/><path d="M22 11V9"/><path d="M2 11V9"/><path d="M6 4V2"/><path d="M18 4V2"/><path d="M10 4V2"/><path d="M14 4V2"/></svg>'

function textDiv(cls: string, text: string) {
  const d = document.createElement('div')
  d.className = cls
  d.textContent = text
  return d
}

type Side = 'left' | 'right'

/**
 * The place: a green pin, its name card above it and "click to change place" beside it.
 * The marker itself is a zero-size box on the exact spot; card and hint hang off it (phones show the pin only).
 */
function pinEl(title: string, sub: string, elev: string | null, hint: string, side: Side) {
  const right = side === 'right'
  const wrap = document.createElement('div')
  wrap.className = 'size-0'
  const card = document.createElement('div')
  card.className = `absolute bottom-[46px] hidden w-max max-w-[17rem] items-start gap-2 rounded-xl border border-[#1e3a6b] bg-[#06152d]/95 py-2 pr-4 pl-2.5 text-left shadow-2xl sm:flex ${right ? '-left-6' : '-right-6'}`
  const icon = document.createElement('span')
  icon.className = 'mt-0.5 shrink-0'
  icon.innerHTML = PIN_LINE('#fff')
  const text = document.createElement('div')
  text.append(textDiv('text-[16px] font-bold leading-tight text-white', title))
  if (sub) text.append(textDiv('text-[13px] leading-snug text-[#c7d3ea]', sub))
  if (elev) text.append(textDiv('text-[13px] leading-snug text-[#c7d3ea]', elev))
  card.append(icon, text)
  const pin = document.createElement('div')
  pin.className = 'absolute bottom-0 -left-[15px]'
  pin.innerHTML = PIN_SVG
  const tip = document.createElement('div')
  tip.className = `pointer-events-none absolute -top-3.5 hidden w-max items-center gap-2 sm:flex ${right ? 'left-8' : 'right-8 flex-row-reverse'}`
  const cursor = document.createElement('span')
  cursor.innerHTML = CURSOR_SVG
  if (!right) cursor.style.transform = 'scaleX(-1)'
  const box = document.createElement('div')
  box.className = 'flex max-w-[11rem] items-center gap-2 rounded-xl border border-[#1e3a6b] bg-[#06152d]/92 px-3 py-1.5 text-[13px] leading-snug text-white shadow-2xl'
  const bi = document.createElement('span')
  bi.className = 'shrink-0'
  bi.innerHTML = PIN_LINE('#4ade80')
  box.append(bi, textDiv('', hint))
  tip.append(cursor, box)
  wrap.append(card, pin, tip)
  return wrap
}

/** A landmark near the place, so the map reads at a glance: a round badge on the spot, its name on the far side from the place. */
function landmarkEl(title: string, sub: string, side: Side) {
  const wrap = document.createElement('div')
  wrap.className = 'hidden size-0 sm:block'
  const dot = document.createElement('span')
  dot.className = 'absolute -top-[18px] -left-[18px] grid size-9 place-items-center rounded-full border-2 border-white/80 bg-[#0e7490] shadow-lg'
  dot.innerHTML = FORT_SVG
  const label = document.createElement('div')
  label.className = `absolute top-0 w-max -translate-y-1/2 leading-tight ${side === 'right' ? 'left-6' : 'right-6 text-right'}`
  label.style.textShadow = '0 1px 3px rgb(0 0 0 / .9)'
  label.append(textDiv('text-[15px] font-semibold text-white', title), textDiv('text-[13px] text-[#dbe6f7]', sub))
  wrap.append(dot, label)
  return wrap
}

export function WorkerToday() {
  const { profile, wx, wxStatus, refresh, place, setPlace, startDate } = useApp()
  const { day, next, modes } = useDay(0)
  const { t, f, lang } = useI18n()
  const D = LOOK[lang].dash
  const nowHour = useNowHour(0)
  const [shift, setShift] = useState<Shift>(profile?.shift ?? 'day')
  const [sel, setSel] = useState<number | null>(null)
  const near = useNear(3)
  const to = useLinkTo()

  const name = lang === 'hi' ? place.nameHi : place.name
  const parts = name.split(',')
  const title = parts[0].trim()
  const sub = parts.slice(1).join(',').trim() || (place.pilot ? D.cities[place.pilot] : place.region) || ''
  const elev = wx?.data.elevation
  // a landmark only when it is a short trip away; the map then keeps both in view
  const lm = place.pilot ? LANDMARK[place.pilot] : null
  const lmKm = lm ? km(place.lat, place.lon, lm.lat, lm.lon) : 0
  const landmark = lm && lmKm > 0.3 && lmKm < 8 ? lm : null
  const pins = useMemo(() => {
    const east = !!landmark && landmark.lon > place.lon
    const northKm = landmark ? (landmark.lat - place.lat) * 111.2 : 0
    // a landmark just above and to the right would sit under the card: then the card goes left
    const side: Side = east && northKm > 0 && northKm < 3 ? 'left' : 'right'
    const list = [{ lat: place.lat, lon: place.lon, el: pinEl(title, sub, elev != null ? `${Math.round(elev)} m` : null, D.clickMap, side) }]
    if (landmark && place.pilot) list.push({ lat: landmark.lat, lon: landmark.lon, el: landmarkEl(D.landmarks[place.pilot], D.cities[place.pilot], east ? 'right' : 'left') })
    return list
    // rebuild the markers when the place, its height or the language changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.lat, place.lon, place.pilot, title, sub, elev, lang])

  const pickAt = async (lat: number, lon: number) => {
    const n = await reverseGeocode(lat, lon).catch(() => null)
    const label = `${lat.toFixed(3)}, ${lon.toFixed(3)}`
    setPlace({ name: n?.name ?? label, nameHi: n?.nameHi ?? label, region: n?.region, pin: n?.pin, lat, lon, pilot: pilotFor(lat, lon), source: 'search' })
  }
  const locate = () => {
    placeFromGps()
      .then((p) => setPlace(p))
      .catch(() => {})
  }

  if (!day && wxStatus === 'error')
    return (
      <section className="panel p-5">
        <p className="font-semibold">{t.picker.netErr}</p>
        <button type="button" className="btn btn-ink mt-3" onClick={refresh}>
          {t.app.tryAgain}
        </button>
        <div className="mt-4">
          <DangerBar />
        </div>
      </section>
    )
  if (!day)
    return (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-5">
          <Skel className="h-[340px] w-full" />
          <Skel className="h-72 w-full" />
        </div>
        <div className="space-y-5">
          <Skel className="h-44 w-full" />
          <Skel className="h-16 w-full" />
          <Skel className="h-64 w-full" />
        </div>
      </div>
    )

  const shiftHours = day.hours.filter((h) => inShift(h.hour, shift))
  const level = (shiftHours.length ? Math.max(...shiftHours.map(hourLevel)) : dayLevel(day)) as Level
  const c = wx?.data.current
  const feels = c ? Math.round(c.feels) : Math.round(day.fmax)
  const temp = c ? Math.round(c.temp) : Math.round(day.tmax)
  const info = conditionOf(day, next)
  const cond = info.cond
  const advice =
    cond === 'warm' || cond === 'hot' ? t.worker.advice.heat
    : cond === 'double' ? `${t.worker.advice.heat} ${t.worker.advice.smoky}`
    : cond === 'air' ? t.worker.advice.smoky
    : cond === 'cold' ? t.worker.advice.cold
    : cond === 'rain' ? t.worker.advice.rain
    : t.worker.advice[modes[0]]
  const rw = rainWord(day)
  const rainTitle = rw === 'dry' ? D.noRainToday : D.rainToday
  const rainText = D.rain[rw]
  const rainEmoji = rw === 'dry' ? 'sun_cloud' : 'cloud_rain'
  const air = wx?.data.air
  const aqi = air?.aqi ?? day.aqi
  const aqiCat = aqi != null ? aqiCategory(aqi) : null
  const aqiWord = aqiCat != null ? t.aqi[aqiCat] : '–'
  const at = aqiCat != null ? AIR_TINT[aqiCat] : AIR_NONE
  const month = Number((startDate || day.date).slice(5, 7))
  const ritu = t.ritu[rituOf(month)]
  const modeLabel = modeChips(modes, cond, t)[0].label
  const modeEmoji = cond === 'rain' || rw !== 'dry' ? 'cloud_rain' : COND_EMOJI[cond]
  const tint = LEVEL_TINT[level]
  const levelWord = t.level[level]
  const hoursText = (s: Shift) => (s === 'day' ? t.today.shiftDay : t.today.shiftNight).replace(/^[^(]*\(|\)$/g, '')

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* ---------- left: map, then the shift ---------- */}
        <div className="min-w-0 space-y-5">
          <HeroMap center={place} pins={pins} keep={landmark} onPick={pickAt} onLocate={locate} className="h-[260px] sm:h-[340px]">
            <a
              href="#your-shift"
              className="lift absolute top-4 left-4 z-10 flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-white shadow-2xl"
              style={{ background: tint.bg, borderColor: tint.edge }}
            >
              <ShieldCheck3D level={level} size={36} />
              <span className="text-[18px] font-semibold whitespace-nowrap sm:text-[19px]">
                {D.todayOutside}: <b className="font-bold">{levelWord}</b>
              </span>
              <ChevronRight className="size-5" strokeWidth={2.2} aria-hidden />
            </a>
          </HeroMap>

          {/* phones: the way to help comes right after the risk, before any scrolling */}
          <div className="xl:hidden">
            <DangerBar />
          </div>

          <section id="your-shift" className="panel @container scroll-mt-28 px-5 pt-4 pb-4">
            <div className="grid gap-5 @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="@container min-w-0">
                <div className="flex items-center gap-3">
                  <HardHat className="size-7 text-[#9cc3ff]" strokeWidth={1.7} aria-hidden />
                  <h2 className="text-[22px] font-bold">{t.worker.yourShift}</h2>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(['day', 'night'] as Shift[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={shift === s}
                      onClick={() => setShift(s)}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[16px] font-semibold ${
                        shift === s
                          ? 'border-[#38bdf8]/60 bg-gradient-to-r from-[#0e7490] to-[#0369a1] text-white shadow-[0_8px_20px_-10px_rgb(14_116_144/0.9)]'
                          : 'border-[#1e3a6b] bg-[#06152d] text-[#dbe6f7]'
                      }`}
                    >
                      {s === 'day' ? <Sun className="size-6 text-[#fcd34d]" strokeWidth={2} aria-hidden /> : <Moon className="size-6 text-[#c7d3ea]" strokeWidth={2} aria-hidden />}
                      {t.form.shifts[s]} <span className="hidden text-[14px] font-normal whitespace-nowrap opacity-90 @md:inline">({hoursText(s)})</span>
                    </button>
                  ))}
                </div>
                <ShiftDots day={day} shift={shift} nowHour={nowHour} sel={sel} onSel={(h) => setSel(sel === h ? null : h)} />
              </div>

              <div className="grid content-start gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: at.edge, background: at.bg }}>
                  <span className="grid size-12 shrink-0 place-items-center rounded-full" style={{ background: at.dot }}>
                    <Leaf className="size-6" style={{ color: at.icon }} fill={at.fill} strokeWidth={1.9} aria-hidden />
                  </span>
                  <Src text={t.header.aqiTip}>
                    <span className="block leading-tight">
                      <span className="block text-[15px]" style={{ color: at.text }}>AQI</span>
                      <span className="block text-[30px] font-bold text-white">{aqi ?? '–'}</span>
                      <span className="block text-[15px]" style={{ color: at.text }}>{aqiWord}</span>
                    </span>
                  </Src>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-[#1d4ed8]/40 bg-[#05253f] px-4 py-3">
                  <Emoji name={rainEmoji} size={48} />
                  <span className="leading-tight">
                    <span className="block text-[16px] text-[#9cc3ff]">{rainTitle}</span>
                    <span className="block text-[17px] font-semibold text-[#7cc4ff]">{rainText}</span>
                  </span>
                </div>
                <div className="flex items-center gap-4 rounded-xl border border-[#16325c] bg-[#061a36] px-4 py-3 sm:col-span-2">
                  <Leaf className="size-8 shrink-0 fill-[#a3e635]/25 text-[#a3e635]" strokeWidth={1.6} aria-hidden />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[15px] text-[#c7d3ea]">{D.season}</span>
                    <span className="block text-[19px] font-semibold text-white">{ritu}</span>
                  </span>
                  <span aria-hidden className="h-10 w-px bg-[#16325c]" />
                  <span className="flex items-center gap-2">
                    <Emoji name={modeEmoji} size={34} />
                    <span className="text-[15px] text-[#9cc3ff]">{modeLabel}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 hidden xl:block">
              <DangerBar />
            </div>
          </section>
        </div>

        {/* ---------- right: weather and air, season, help near me ---------- */}
        <div className="space-y-5">
          <section className="panel p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Emoji name={c ? wxEmoji(c.code, c.isDay) : wxEmoji(day.code)} size={86} float slow eager />
              <Src kind="live">
                <span className="block leading-none">
                  <span className="block text-[54px] font-bold text-white">{temp}°</span>
                  <span className="mt-1 block text-[16px] whitespace-nowrap text-[#c7d3ea]">{f(D.feelsLikeN, { t: feels })}</span>
                </span>
              </Src>
              <span aria-hidden className="mx-1 hidden h-20 w-px bg-[#16325c] sm:block" />
              <span className="flex min-w-0 flex-1 basis-32 items-center gap-2">
                <Emoji name={rainEmoji} size={46} />
                <span className="leading-tight">
                  <span className="block text-[16px] text-[#7cc4ff]">{rainTitle}</span>
                  <span className="block text-[16px] text-[#7cc4ff]">{rainText}</span>
                </span>
              </span>
            </div>
            <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] divide-x divide-[#16325c] border-t border-[#16325c] pt-4 text-[17px]">
              <span className="flex items-center gap-2 pr-3">
                <Leaf className="size-6 shrink-0" style={{ color: at.icon }} fill={at.fill} strokeWidth={1.8} aria-hidden />
                <Src text={t.header.aqiTip}>
                  <span className="whitespace-nowrap">
                    <span className="max-sm:sr-only">{D.air}: </span>
                    <b style={{ color: at.icon }}>{aqiWord}</b>
                  </span>
                </Src>
              </span>
              <span className="px-3 text-center whitespace-nowrap">
                AQI <b className="text-white">{aqi ?? '–'}</b>
              </span>
              <span className="pl-3 text-right whitespace-nowrap">
                PM2.5 <b className="text-white">{air ? Math.round(air.pm25) : '–'}</b>
              </span>
            </div>
          </section>

          <section className="panel flex items-center gap-4 px-5 py-4">
            <Leaf className="size-8 shrink-0 fill-[#a3e635]/25 text-[#a3e635]" strokeWidth={1.6} aria-hidden />
            <span className="flex-1 text-[18px] font-semibold text-white">{ritu}</span>
            <span aria-hidden className="h-9 w-px bg-[#16325c]" />
            <Emoji name={modeEmoji} size={34} />
            <span className="text-[17px] text-[#dbe6f7]">{modeLabel}</span>
          </section>

          <section className="panel p-5">
            <div className="mb-2 flex items-center gap-3">
              <MapPin className="size-6 text-[#9cc3ff]" strokeWidth={1.8} aria-hidden />
              <h2 className="flex-1 text-[20px] font-bold">{t.worker.near}</h2>
              <Link to={to('/near')} className="flex items-center gap-1 text-[16px] font-semibold text-[#60a5fa] hover:text-[#93c5fd]">
                {D.seeAll} <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden />
              </Link>
            </div>
            <NearRows rows={near} />
          </section>
        </div>
      </div>

      {/* ---------- bottom: the day at a glance ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.35fr_0.95fr_0.95fr_1.1fr_1.7fr]">
        <a href="#your-shift" className="lift rounded-2xl border p-4 text-white" style={{ background: tint.bg, borderColor: tint.edge }}>
          <span className="flex items-center gap-3">
            <ShieldCheck3D level={level} size={46} />
            <span className="flex-1 leading-tight">
              <span className="block text-[16px]">{D.todayOutside}</span>
              <span className="block text-[28px] font-bold">{levelWord}</span>
            </span>
            <ChevronRight className="size-5" strokeWidth={2.2} aria-hidden />
          </span>
          <span className="mt-2 block text-[15px] text-white/90">{advice}</span>
        </a>
        <a href="#your-shift" className="lift panel flex items-center gap-3 p-4">
          <Emoji name={c ? wxEmoji(c.code, c.isDay) : 'cloud'} size={56} />
          <span className="flex-1 leading-tight">
            <span className="block text-[30px] font-bold text-white">{feels}°</span>
            <span className="block text-[15px] text-[#c7d3ea]">{D.feelsLike}</span>
          </span>
          <ChevronRight className="size-5 text-[#c7d3ea]" strokeWidth={2.2} aria-hidden />
        </a>
        <a href="#your-shift" className="lift flex items-center gap-3 rounded-2xl border p-4" style={{ borderColor: at.edge, background: at.bg }}>
          <Leaf className="size-12 shrink-0" style={{ color: at.icon }} fill={at.fill} strokeWidth={1.4} aria-hidden />
          <span className="flex-1 leading-tight">
            <span className="block text-[15px]" style={{ color: at.text }}>AQI</span>
            <span className="block text-[28px] font-bold text-white">{aqi ?? '–'}</span>
            <span className="block text-[15px]" style={{ color: at.text }}>{aqiWord}</span>
          </span>
          <ChevronRight className="size-5" style={{ color: at.text }} strokeWidth={2.2} aria-hidden />
        </a>
        <a href="#your-shift" className="lift flex items-center gap-3 rounded-2xl border border-[#1d4ed8]/40 bg-[#05253f] p-4">
          <Emoji name={rainEmoji} size={56} />
          <span className="flex-1 leading-tight">
            <span className="block text-[16px] text-[#9cc3ff]">{rainTitle}</span>
            <span className="block text-[16px] font-semibold text-[#7cc4ff]">{rainText}</span>
          </span>
          <ChevronRight className="size-5 text-[#9cc3ff]" strokeWidth={2.2} aria-hidden />
        </a>
        <div className="relative flex min-h-[120px] items-center overflow-hidden rounded-2xl border border-[#16325c] bg-gradient-to-r from-[#061a36] via-[#08224a] to-[#0b2a57] p-5 sm:col-span-2 xl:col-span-1">
          <img src="/art/community-scene.png" alt="" aria-hidden className="absolute right-0 bottom-0 h-full w-auto object-cover" draggable={false} />
          <span className="relative text-[19px] leading-snug font-semibold text-[#9cd8ff]" style={{ textShadow: '0 1px 6px rgb(0 0 0 / .8)' }}>
            {D.safer}
            <br />
            {D.stronger}
          </span>
        </div>
      </div>

      <SafetyCards day={day} next={next} shift={shift} />

      <div className="flex justify-end">
        <ReadAloud text={`${D.todayOutside}: ${levelWord}. ${D.feelsLike} ${feels}°. ${advice}`} />
      </div>
    </div>
  )
}

interface NearRow {
  p: Point
  d: number
}
/** Water, shelters and hospitals from OpenStreetMap for any place (loaded once per place). */
function useOsmHelp(): Point[] {
  const { place } = useApp()
  const [help, setHelp] = useState<{ key: string; points: Point[] }>({ key: '', points: [] })
  const key = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`
  const names = useMemo(
    () => ({
      water: [UI.en.safety.helpNames.water, UI.hi.safety.helpNames.water] as [string, string],
      shelter: [UI.en.safety.helpNames.shelter, UI.hi.safety.helpNames.shelter] as [string, string],
      medical: [UI.en.safety.helpNames.medical, UI.hi.safety.helpNames.medical] as [string, string],
    }),
    [],
  )
  useEffect(() => {
    let off = false
    loadHelpNear(place.lat, place.lon, names)
      .then((points) => !off && setHelp({ key, points }))
      .catch(() => !off && setHelp({ key, points: [] }))
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return help.key === key ? help.points : []
}

function useNear(limit: number): NearRow[] | null {
  const { place, pts } = useApp()
  const osm = useOsmHelp()
  return useMemo(() => {
    // still loading: skeleton; failed: whatever OSM help we have, or "none near"
    if (pts.status === 'loading' && !osm.length) return null
    const curated = (pts.points ?? []).filter((p) => p.offers?.length)
    // an OSM place already in the curated list (within 80 m) is not shown twice
    const extra = osm.filter((o) => !curated.some((c) => km(c.lat, c.lon, o.lat, o.lon) < 0.08))
    return [...curated, ...extra]
      .map((p) => ({ p, d: km(place.lat, place.lon, p.lat, p.lon) }))
      // "near" means near: never list a place from another city
      .filter((r) => r.d <= 25)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
  }, [pts.points, pts.status, osm, place.lat, place.lon, limit])
}

/** Hospital red, shelter blue, water cyan, anything else green: the icon squares of the design. */
function nearIcon(p: Point): { bg: string; Icon: typeof Plus } {
  if (p.type === 'shelter' || p.offers?.includes('shelter')) return { bg: '#3294fb', Icon: House }
  if (p.type === 'hospital' || p.offers?.includes('medical')) return { bg: '#e73040', Icon: Plus }
  if (p.type === 'water') return { bg: '#0891b2', Icon: Droplet }
  return { bg: '#0a9f5c', Icon: Plus }
}

function NearRows({ rows }: { rows: NearRow[] | null }) {
  const { t, f, lang } = useI18n()
  const { place } = useApp()
  const D = LOOK[lang].dash
  const helpline = inNcr(place.lat, place.lon) && (
    <p className="mt-2 flex items-center gap-2 text-[15px] font-semibold text-[#9cc3ff]">
      <PhoneCall className="size-4 shrink-0" strokeWidth={2} aria-hidden />
      <a href="tel:14461" className="underline">{t.safety.shelterDelhi}</a>
    </p>
  )
  if (!rows) return <Skel className="h-40 w-full" />
  if (!rows.length)
    return (
      <>
        <p className="py-3 text-[#c7d3ea]">{t.worker.noneNear}</p>
        {helpline}
      </>
    )
  return (
    <>
    {helpline}
    <ul className="divide-y divide-[#16325c]">
      {rows.map(({ p, d }) => {
        const { bg, Icon } = nearIcon(p)
        return (
          <li key={p.id} className="flex items-center gap-4 py-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl shadow-lg" style={{ background: bg }}>
              <Icon className="size-7 text-white" strokeWidth={2.6} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-[16px] leading-snug text-[#eaf2fb]">{pointName(p, lang)}</span>
            <span className="text-[17px] font-semibold whitespace-nowrap text-white tabular">{f(D.km, { d: d < 10 ? d.toFixed(1) : String(Math.round(d)) })}</span>
            <a
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1d3d70] text-white hover:bg-[#2563eb]"
              href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`${t.worker.directions}: ${pointName(p, lang)}`}
            >
              <Navigation className="size-5" strokeWidth={2} aria-hidden />
            </a>
          </li>
        )
      })}
    </ul>
    </>
  )
}

export function NearList({ limit = 10 }: { limit?: number }) {
  const { t } = useI18n()
  const rows = useNear(limit)
  return (
    <section className="panel p-5">
      <h2 className="mb-2 text-[20px] font-bold">{t.worker.near}</h2>
      <NearRows rows={rows} />
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
