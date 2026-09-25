import { ChevronDown, Menu, Pointer, RefreshCw, Settings, UserRound, Users, WifiOff } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApp, useDay } from '../ctx'
import { useI18n } from '../i18n'
import { ago, clockDate, clockTime } from '../lib/ist'
import { condColor, conditionOf } from '../lib/risk'
import { ICON, Skel, Src } from './atoms'
import { Emoji, wxEmoji } from './Emoji'

export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), every)
    return () => clearInterval(id)
  }, [every])
  return now
}

/** The green map pin of the design. */
export function PinGreen({ size = 34 }: { size?: number }) {
  // own gradient id per pin: the desktop and phone headers both draw one, and one of them is always hidden
  const id = `pin-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg viewBox="0 0 32 40" width={size * 0.8} height={size} aria-hidden className="shrink-0 drop-shadow-[0_6px_10px_rgb(34_197_94/0.45)]">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4ade80" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <path d="M16 1C8 1 2 7.2 2 15c0 10.2 12.4 22.6 13 23.2a1.4 1.4 0 0 0 2 0C17.6 37.6 30 25.2 30 15 30 7.2 24 1 16 1z" fill={`url(#${id})`} />
      <circle cx="16" cy="15" r="5.2" fill="#ecfdf5" />
    </svg>
  )
}

export function LangSwitch({ plain }: { plain?: boolean }) {
  const { lang, setLang } = useI18n()
  return (
    <button
      type="button"
      className={plain ? 'rounded-lg px-2 py-1 text-lg font-semibold text-ink hover:bg-white/5' : 'btn btn-line btn-sm min-w-[4.5rem] font-bold'}
      onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
      aria-label={lang === 'en' ? 'हिंदी में बदलें' : 'Switch to English'}
    >
      {lang === 'en' ? 'हिंदी' : 'English'}
    </button>
  )
}

function RoleMenu() {
  const { profile, setProfile } = useApp()
  const { t } = useI18n()
  const nav = useNavigate()
  const { search } = useLocation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  if (!profile) return null
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/5"
      >
        <UserRound className="size-8 text-[#9cc3ff]" strokeWidth={1.6} aria-hidden />
        <span className="text-[17px] font-semibold">{t.role[profile.role]}</span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} {...ICON} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="pop-in absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-paper py-1 shadow-2xl">
          <Link role="menuitem" to={{ pathname: '/settings', search }} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/5">
            <Settings className="size-4" {...ICON} aria-hidden /> {t.nav.settings}
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false)
              setProfile(null)
              nav({ pathname: '/welcome', search })
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-white/5"
          >
            <Users className="size-4" {...ICON} aria-hidden /> {t.nav.switchRole}
          </button>
        </div>
      )}
    </div>
  )
}

const Divider = () => <span aria-hidden className="hidden h-12 w-px shrink-0 bg-[#16325c] lg:block" />

export function Header({ onPlace, onMenu }: { onPlace: () => void; onMenu: () => void }) {
  const { place, wx, wxStatus, refresh, replay } = useApp()
  const { day, next } = useDay(0)
  const { t, f, lang } = useI18n()
  const now = useNow()
  const c = wx?.data.current
  // no data and no saved copy: show nothing rather than a skeleton that never ends
  const failed = wxStatus === 'error' && !wx
  const info = day ? conditionOf(day, next) : null
  const tint = info ? condColor(info) : '#16325c'
  const elev = wx?.data.elevation
  const name = lang === 'hi' ? place.nameHi : place.name
  const loc = lang === 'hi' ? 'hi-IN' : 'en-IN'
  // replays show the real date being replayed instead of today's clock
  const dateLine = replay && wx?.data.replayDate
    ? new Date(wx.data.replayDate + 'T00:00:00Z').toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : now.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

  // honest label for where today's numbers come from: Live / Saved forecast / Real past day
  const savedAt = wx ? new Date(wx.savedAt) : null
  const savedText = savedAt
    ? `${savedAt.toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}, ${clockTime(savedAt, lang)}`
    : ''
  const isLive = !!wx && !replay && wx.from === 'network' && !wx.stale
  const badgeText = !wx ? null : replay ? t.header.realPast : isLive ? t.header.live : t.header.savedShort
  const badgeTitle = !wx ? '' : `${replay ? t.header.realPast : isLive ? t.header.live : f(t.header.saved, { time: savedText })} · ${f(t.header.updated, { ago: ago(now.getTime() - wx.savedAt, lang) })} · ${t.header.refresh}`
  const badge = badgeText && (
    <button
      type="button"
      onClick={refresh}
      title={badgeTitle}
      aria-label={badgeTitle}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-bold whitespace-nowrap ${
        isLive ? 'bg-[#15803d] text-white' : replay ? 'bg-[#334155] text-white' : 'bg-[#92400e] text-white'
      }`}
    >
      {wxStatus === 'loading' ? <RefreshCw className="size-3 animate-spin" {...ICON} aria-hidden /> : isLive ? <span className="live-dot !size-1.5" aria-hidden /> : null}
      {badgeText}
    </button>
  )

  return (
    <header className="glass sticky top-0 z-40 border-b border-[#16325c]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* ---------- desktop / laptop ---------- */}
      <div className="hidden h-[80px] items-center gap-6 px-6 lg:flex">
        <Link to="/" className="flex shrink-0 items-center gap-3" aria-label={t.app.name}>
          <Emoji name="sun_cloud" size={46} eager />
          <span className="text-[26px] font-bold tracking-tight text-white">{t.app.name}</span>
        </Link>
        <Divider />

        <div className="flex min-w-0 items-center gap-4">
          <PinGreen size={40} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[18px] font-semibold text-white" title={name}>
              {name}
            </div>
            {elev != null && <div className="mt-1 truncate text-[13px] text-[#c7d3ea]">{f(t.header.elevation, { m: Math.round(elev) })}</div>}
          </div>
          <button type="button" onClick={onPlace} className="shrink-0 rounded-full border border-[#1f4f86] bg-[#04203f] px-5 py-2 text-[15px] font-semibold text-white hover:border-[#38bdf8]">
            {t.header.changePlace}
          </button>
          <Pointer className="hidden size-7 shrink-0 text-[#9cc3ff] 2xl:block" strokeWidth={1.6} aria-hidden />
        </div>

        <Divider />
        <div className="shrink-0 leading-tight">
          <div className="text-[14px] text-[#c7d3ea]">{dateLine}</div>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-[22px] font-bold text-white">{replay ? t.header.realPast : clockTime(now, lang)}</span>
            {badge}
          </div>
        </div>

        <Divider />
        <div className="flex shrink-0 items-center">
          {c ? (
            <Src kind="live">
              <span className="flex items-center gap-3">
                <Emoji name={wxEmoji(c.code, c.isDay)} size={48} float slow />
                <span className="leading-tight">
                  <span className="block text-[26px] font-bold text-white">{Math.round(c.temp)}°</span>
                  <span className="block text-[14px] text-[#c7d3ea]">{f(t.header.feels, { t: Math.round(c.feels) })}</span>
                </span>
              </span>
            </Src>
          ) : failed ? null : (
            <Skel className="h-12 w-28" />
          )}
        </div>

        <Divider />
        <LangSwitch plain />
        <div className="ml-auto">
          <RoleMenu />
        </div>
      </div>

      {/* ---------- phone / tablet ---------- */}
      <div className="px-3 pt-2 pb-2 lg:hidden">
        <div className="flex items-center gap-2.5">
          <Emoji name="sun_cloud" size={32} eager />
          <button type="button" onClick={onPlace} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`${t.header.changePlace}: ${name}`}>
            <PinGreen size={24} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-white">{name}</span>
              <span className="block text-[12px] text-[#9cc3ff]">{t.header.changePlace}</span>
            </span>
          </button>
          {c ? (
            <Src kind="live">
              <span className="flex items-center gap-1">
                <Emoji name={wxEmoji(c.code, c.isDay)} size={28} />
                <span className="text-xl font-bold text-white">{Math.round(c.temp)}°</span>
              </span>
            </Src>
          ) : failed ? null : (
            <Skel className="h-8 w-14" />
          )}
          <button type="button" className="btn btn-ghost btn-sm !px-2" onClick={onMenu} aria-label={t.header.menu}>
            <Menu className="size-6" {...ICON} aria-hidden />
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[13px]">
          <span className="text-[#c7d3ea]">{dateLine}</span>
          {!replay && <span className="font-bold text-white">{clockTime(now, lang)}</span>}
          {badge}
        </div>
      </div>

      <div aria-hidden className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, transparent, ${tint} 30%, ${tint} 70%, transparent)` }} />
      {wx?.stale && (
        <div role="status" className="flex items-center justify-center gap-2 bg-[#3b1520] px-3 py-1.5 text-center text-sm text-[#fecdd3]">
          <WifiOff className="size-4" {...ICON} aria-hidden />
          {f(typeof navigator !== 'undefined' && !navigator.onLine ? t.header.offline : t.header.refreshFail, {
            time: `${clockTime(new Date(wx.savedAt), lang)}, ${clockDate(new Date(wx.savedAt), lang)}`,
          })}
        </div>
      )}
    </header>
  )
}
