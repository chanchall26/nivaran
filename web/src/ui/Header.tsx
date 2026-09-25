import { Menu, RefreshCw, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useDay } from '../ctx'
import { useI18n } from '../i18n'
import { ago, clockDate, clockTime, istToday, longDate } from '../lib/ist'
import { AQI_COLOR, aqiCategory, condColor, conditionOf, rituOf } from '../lib/risk'
import { modeChips } from './Condition'
import { AqiDot, ICON, Skel, Src, useWxText } from './atoms'
import { Emoji, wxEmoji, type EmojiName } from './Emoji'
import { StationBoard } from './StationBoard'

export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), every)
    return () => clearInterval(id)
  }, [every])
  return now
}

function Logo() {
  return (
    <span className="grad-sunrise grid size-10 shrink-0 place-items-center rounded-2xl shadow-[0_8px_18px_-8px_rgb(219_39_119/0.8)] ring-1 ring-white/50">
      <Emoji name="sunrise" size={28} eager />
    </span>
  )
}

const ROLE_EMOJI: Record<string, EmojiName> = { officer: 'building', partner: 'handshake', worker: 'worker' }

export function LangSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <button
      type="button"
      className="btn btn-line btn-sm min-w-[4.5rem] gap-1.5 font-bold"
      onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
      aria-label={lang === 'en' ? 'हिंदी में बदलें' : 'Switch to English'}
    >
      <Emoji name="globe" size={18} /> {lang === 'en' ? 'हिंदी' : 'EN'}
    </button>
  )
}

export function Header({ onPlace, onMenu }: { onPlace: () => void; onMenu: () => void }) {
  const { place, wx, wxStatus, refresh, profile, replay, startDate } = useApp()
  const { day, next, modes } = useDay(0)
  const { t, f, lang } = useI18n()
  const wxText = useWxText()
  const now = useNow()
  const c = wx?.data.current
  // no data and no saved copy: show nothing rather than a skeleton that never ends
  const failed = wxStatus === 'error' && !wx
  const air = wx?.data.air
  const month = Number((startDate || istToday()).slice(5, 7))
  const info = day ? conditionOf(day, next) : null
  const cond = info?.cond ?? 'mild'
  const chips = modeChips(modes, cond, t)
  const modeTint = chips[0].color
  // the colour strip under the header follows today's screen (condition)
  const tint = info ? condColor(info) : '#d5dce0'
  const elev = wx?.data.elevation
  const board = (size: 'sm' | 'md') => (
    <StationBoard
      hi={place.nameHi}
      en={place.name}
      small={elev != null ? (lang === 'hi' ? `समुद्र तल से ऊंचाई: ${Math.round(elev)} मी` : `Height above sea level: ${Math.round(elev)} m`) : undefined}
      size={size}
    />
  )
  // replays show the real date being replayed instead of today's clock
  const timeMain = replay && wx?.data.replayDate ? longDate(wx.data.replayDate, lang) : clockTime(now, lang)
  const timeSub = replay ? t.src.replayShort : clockDate(now, lang)
  // phones: "25 Dec 2024" fits on one line; the source label already says "Real past day"
  const timeShort =
    replay && wx?.data.replayDate
      ? new Date(wx.data.replayDate + 'T00:00:00Z').toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      : timeMain

  const modeChip = (
    <span className="chip font-semibold" style={{ borderColor: modeTint, boxShadow: `inset 0 0 0 1px ${modeTint}` }}>
      <span aria-hidden className="size-2 rounded-full" style={{ background: modeTint }} />
      {chips[0].label}
      {chips[1] && <span className="text-muted">+ {chips[1].label}</span>}
    </span>
  )
  // honest label for where today's numbers come from
  const savedAt = wx ? new Date(wx.savedAt) : null
  const savedText = savedAt
    ? `${savedAt.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}, ${clockTime(savedAt, lang)}`
    : ''
  const source = (short: boolean) => !wx ? null : replay ? (
    <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-muted">{t.header.realPast}</span>
  ) : wx.from === 'network' && !wx.stale ? (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#157a45]">
      <span className="live-dot" aria-hidden /> {t.header.live}
    </span>
  ) : (
    <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-muted" title={f(t.header.saved, { time: savedText })}>
      {short ? t.header.savedShort : f(t.header.saved, { time: savedText })}
    </span>
  )
  const updated = wx ? (
    <button type="button" className="btn btn-ghost btn-sm !min-h-7 !py-0 whitespace-nowrap text-muted" onClick={refresh} title={t.header.refresh}>
      <RefreshCw className={`size-4 ${wxStatus === 'loading' ? 'animate-spin' : ''}`} {...ICON} aria-hidden />
      <span className="text-xs">{f(t.header.updated, { ago: ago(now.getTime() - wx.savedAt, lang) })}</span>
      <span className="sr-only">{t.header.refresh}</span>
    </button>
  ) : null

  return (
    <header className="glass sticky top-0 z-40 border-b border-white/60 shadow-[0_8px_30px_-18px_rgb(76_29_149/0.45)]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* ---------- desktop / laptop ---------- */}
      <div className="hidden items-center gap-2.5 px-4 py-2 lg:flex">
        <Link to="/" className="flex items-center gap-2.5" aria-label={t.app.name}>
          <Logo />
          <span className="hidden font-display text-lg leading-none font-bold 2xl:block">
            <span className="grad-text">{t.app.name}</span>
          </span>
        </Link>
        {board('md')}
        <div className="flex flex-col items-start gap-1">
          <button type="button" className="btn btn-line btn-sm whitespace-nowrap" onClick={onPlace}>
            <Emoji name="pin" size={18} pop /> {t.header.changePlace}
          </button>
          <span className="pl-1">{source(false)}</span>
        </div>

        <div className="mx-auto flex flex-col items-center px-2 text-center">
          <span className="num text-[28px] font-bold">{timeMain}</span>
          <span className="text-xs text-muted">{timeSub}</span>
          <span className="-mb-1 hidden 2xl:block">{updated}</span>
        </div>

        <div className="flex items-center gap-2">
          {c ? (
            <Src kind="live">
              <span className="lift flex items-center gap-2 rounded-2xl bg-gradient-to-br from-sky-50 to-violet-50 px-3 py-1 ring-1 ring-sky-100">
                <Emoji name={wxEmoji(c.code, c.isDay)} size={34} float slow />
                <span className="num text-2xl">{Math.round(c.temp)}°</span>
                <span className="flex flex-col text-xs leading-tight whitespace-nowrap">
                  <span className="font-semibold">{f(t.header.feels, { t: Math.round(c.feels) })}</span>
                  <span className="text-muted">{wxText(day?.code ?? c.code)}</span>
                </span>
              </span>
            </Src>
          ) : (
            (failed ? null : <Skel className="h-10 w-40 rounded-full" />)
          )}
          {wx ? (
            air ? (
              <Src text={t.header.aqiTip}>
                <span
                  className="lift flex items-center gap-2 rounded-2xl px-3 py-1.5 ring-1 ring-black/5"
                  style={{ background: `linear-gradient(135deg, ${AQI_COLOR[aqiCategory(air.aqi)]}33, #ffffff)` }}
                >
                  <Emoji name={air.aqi > 200 ? 'mask' : 'leaf'} size={26} />
                  <AqiDot aqi={air.aqi} />
                  <span className="flex flex-col text-xs leading-tight whitespace-nowrap">
                    <span className="font-semibold">{f(t.header.air, { cat: t.aqi[aqiCategory(air.aqi)] })}</span>
                    <span className="text-muted">{f(t.header.aqiLine, { aqi: air.aqi, pm: Math.round(air.pm25) })}</span>
                  </span>
                </span>
              </Src>
            ) : (
              <span className="rounded-full border border-line px-3 py-1.5 text-xs text-muted">{replay ? t.src.airNoReplay : t.header.noAir}</span>
            )
          ) : (
            (failed ? null : <Skel className="h-10 w-36 rounded-full" />)
          )}
          <span className="hidden flex-col items-start gap-0.5 2xl:flex">
            <span className="text-xs font-semibold text-muted">{t.ritu[rituOf(month)]}</span>
            {modeChip}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <LangSwitch />
          {profile && (
            <Link to="/settings" className="chip lift !py-1 font-semibold" title={t.header.role}>
              <Emoji name={ROLE_EMOJI[profile.role] ?? 'people'} size={20} pop /> {t.role[profile.role]}
            </Link>
          )}
        </div>
      </div>

      {/* laptop-width second line: season + updated (hidden on very wide screens where it fits above) */}
      <div className="hidden items-center gap-3 border-t border-white/70 px-4 py-1 lg:flex 2xl:hidden">
        <Emoji name="leaf" size={18} />
        <span className="text-xs font-semibold text-muted">{t.ritu[rituOf(month)]}</span>
        {modeChip}
        <span className="ml-auto">{updated}</span>
      </div>

      {/* ---------- phone / tablet ---------- */}
      <div className="px-3 pt-2 pb-1.5 lg:hidden">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPlace} className="shrink-0 rounded-md" aria-label={`${t.header.changePlace}: ${place.name}`}>
            {board('sm')}
          </button>
          <span className="hidden shrink-0 sm:inline">{source(true)}</span>
          <div className="ml-auto flex items-center gap-2">
            {c ? (
              <Src kind="live">
                <span className="flex items-center gap-1">
                  <Emoji name={wxEmoji(c.code, c.isDay)} size={28} float slow />
                  <span className="num text-2xl">{Math.round(c.temp)}°</span>
                </span>
              </Src>
            ) : (
              (failed ? null : <Skel className="h-8 w-14" />)
            )}
            {air && (
              <Src text={t.header.aqiTip}>
                <span className="flex items-center gap-1 text-xs font-semibold">
                  <AqiDot aqi={air.aqi} /> <span className="sr-only sm:not-sr-only">{t.aqi[aqiCategory(air.aqi)]}</span>
                  <span className="sr-only">{f(t.header.aqiLine, { aqi: air.aqi, pm: Math.round(air.pm25) })}</span>
                </span>
              </Src>
            )}
            <button type="button" className="btn btn-ghost btn-sm !px-2" onClick={onMenu} aria-label={t.header.menu}>
              <Menu className="size-6" {...ICON} aria-hidden />
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="num text-lg font-bold whitespace-nowrap">{timeShort}</span>
          {!replay && <span className="truncate text-xs text-muted">{timeSub}</span>}
          <span className="shrink-0 sm:hidden">{source(true)}</span>
          <span className="ml-auto">{modeChip}</span>
        </div>
      </div>

      <div aria-hidden className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${tint}, ${tint}cc 60%, #c026d3aa)` }} />
      {wx?.stale && (
        <div role="status" className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#1e1b4b] to-[#4c1d95] px-3 py-1.5 text-center text-sm text-white">
          <WifiOff className="size-4" {...ICON} aria-hidden />
          {f(typeof navigator !== 'undefined' && !navigator.onLine ? t.header.offline : t.header.refreshFail, {
            time: `${clockTime(new Date(wx.savedAt), lang)}, ${clockDate(new Date(wx.savedAt), lang)}`,
          })}
        </div>
      )}
    </header>
  )
}
