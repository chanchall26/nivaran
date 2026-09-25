import { ChevronDown, PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { REPLAY_KINDS, replayPlace, type ReplayKind } from '../lib/live'
import { PRESETS, type Place } from '../lib/place'
import type { Role } from '../lib/profile'
import { ICON } from './atoms'
import { Emoji, type EmojiName } from './Emoji'
import { LangSwitch } from './Header'
import { Sheet } from './Sheet'

interface Item {
  to: string
  label: string
  emoji: EmojiName
}

export function useNavItems(role: Role): Item[] {
  const { t } = useI18n()
  const today = { to: '/', label: t.nav.today, emoji: 'house' as const }
  const map = { to: '/map', label: t.nav.map, emoji: 'map' as const }
  const settings = { to: '/settings', label: t.nav.settings, emoji: 'gear' as const }
  const checks = { to: '/checks', label: t.nav.checks, emoji: 'check' as const }
  const plant = { to: '/plant', label: t.nav.plant, emoji: 'seedling' as const }
  const report = { to: '/report', label: t.nav.report, emoji: 'bar_chart' as const }
  if (role === 'officer')
    return [
      today, map,
      { to: '/needs', label: t.nav.needs, emoji: 'clipboard' },
      { to: '/schemes', label: t.nav.schemes, emoji: 'money' },
      checks,
      { to: '/hours', label: t.nav.hours, emoji: 'shield' },
      plant,
      report,
      { to: '/alerts', label: t.nav.alerts, emoji: 'bell' },
      settings,
    ]
  if (role === 'partner') return [today, { to: '/tasks', label: t.nav.tasks, emoji: 'package' }, checks, map, report, plant, settings]
  return [today, { to: '/near', label: t.nav.near, emoji: 'pin' }, { to: '/ask', label: t.nav.ask, emoji: 'raise_hand' }, settings]
}

/** Links keep ?pin / ?date / ?replay so every view stays shareable. */
function useTo() {
  const { search } = useLocation()
  return (pathname: string) => ({ pathname, search })
}

const PAST_EMOJI: Record<ReplayKind, EmojiName> = { smog: 'mask', summer: 'hot_face', double: 'fire', winter: 'cold_face' }
const PLACE_EMOJI: Record<string, EmojiName> = { g: 'city', d: 'office', l: 'mountain' }

function useDemoPlaces() {
  const { t } = useI18n()
  const { setPlace, replay } = useApp()
  const go = (p: Place, r: ReplayKind | null = null) => setPlace(p, { replay: r })
  const rows = [
    { key: 'g', label: t.demoPlaces.gwalior, run: () => go(PRESETS.gwalior) },
    { key: 'd', label: t.demoPlaces.delhi, run: () => go(PRESETS.delhi) },
    { key: 'l', label: t.demoPlaces.leh, run: () => go(PRESETS.leh) },
  ]
  const past = REPLAY_KINDS.map((k) => ({ key: k, label: t.pastDays[k], run: () => go(PRESETS[replayPlace(k)], k), active: replay === k }))
  return { rows, past, replay, backLive: () => go(PRESETS[replay ? replayPlace(replay) : 'gwalior']) }
}

function Group({ title, emoji, open, onToggle, children }: { title: string; emoji: EmojiName; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold hover:bg-violet-50" aria-expanded={open} onClick={onToggle}>
        <Emoji name={emoji} size={22} /> <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} {...ICON} aria-hidden />
      </button>
      {open && <ul className="mt-0.5 space-y-0.5 pl-3">{children}</ul>}
    </div>
  )
}

function BottomExtras({ compact, onDone }: { compact?: boolean; onDone?: () => void }) {
  const { t } = useI18n()
  const { setProfile } = useApp()
  const nav = useNavigate()
  const to = useTo()
  const demo = useDemoPlaces()
  const [open, setOpen] = useState(false)
  const [pastOpen, setPastOpen] = useState(true)
  if (compact)
    return (
      <div className="flex flex-col items-center gap-1 border-t border-line pt-2">
        <NavLink to={to('/sources')} className="grid size-10 place-items-center rounded-xl hover:bg-violet-50" title={t.nav.sources} aria-label={t.nav.sources}>
          <Emoji name="satellite" size={24} pop />
        </NavLink>
      </div>
    )
  return (
    <div className="space-y-1 border-t border-line pt-3 text-sm">
      <Group title={t.nav.demoPlaces} emoji="globe" open={open} onToggle={() => setOpen(!open)}>
        {demo.rows.map((r) => (
          <li key={r.key}>
            <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-violet-50" onClick={() => (r.run(), onDone?.())}>
              <Emoji name={PLACE_EMOJI[r.key]} size={18} /> {r.label}
            </button>
          </li>
        ))}
      </Group>
      <Group title={t.nav.pastDays} emoji="calendar" open={pastOpen} onToggle={() => setPastOpen(!pastOpen)}>
        {demo.past.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              aria-current={r.active ? 'true' : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left leading-snug ${r.active ? 'bg-gradient-to-r from-violet-100 to-pink-100 font-bold' : 'hover:bg-violet-50'}`}
              onClick={() => (r.run(), onDone?.())}
            >
              <Emoji name={PAST_EMOJI[r.key as ReplayKind]} size={18} /> <span>{r.label}</span>
            </button>
          </li>
        ))}
        {demo.replay && (
          <li>
            <button type="button" className="w-full rounded-lg px-3 py-1.5 text-left font-semibold text-[#6d28d9] hover:bg-violet-50" onClick={() => (demo.backLive(), onDone?.())}>
              {t.demoPlaces.backLive}
            </button>
          </li>
        )}
      </Group>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold hover:bg-violet-50"
        onClick={() => {
          setProfile(null)
          onDone?.()
          nav(to('/welcome'))
        }}
      >
        <Emoji name="people" size={22} /> {t.nav.switchRole}
      </button>
      <NavLink to={to('/sources')} onClick={onDone} className="flex items-center gap-2 rounded-xl px-3 py-2 font-semibold hover:bg-violet-50">
        <Emoji name="satellite" size={22} /> {t.nav.sources}
      </NavLink>
    </div>
  )
}

const COLLAPSE_KEY = 'bm:navSmall'

export function Sidebar() {
  const { profile } = useApp()
  const { t } = useI18n()
  const items = useNavItems(profile?.role ?? 'officer')
  const to = useTo()
  const [small, setSmall] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggle = () => {
    setSmall(!small)
    try {
      localStorage.setItem(COLLAPSE_KEY, small ? '0' : '1')
    } catch {
      /* not remembered */
    }
  }
  return (
    <nav
      aria-label="Main"
      className={`glass sticky top-[var(--hdr,92px)] z-10 hidden h-[calc(100dvh-var(--hdr,92px))] shrink-0 flex-col overflow-y-auto border-r border-white/70 py-3 lg:flex ${small ? 'w-[4.5rem] px-2' : 'w-64 px-3'}`}
    >
      <ul className="space-y-0.5 pb-3">
        {items.map(({ to: path, label, emoji }) => (
          <li key={path}>
            <NavLink
              to={to(path)}
              end={path === '/'}
              title={small ? label : undefined}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-2xl py-1.5 font-semibold transition-all ${small ? 'justify-center px-0' : 'px-2.5'} ${
                  isActive
                    ? 'grad-brand text-white shadow-[0_10px_22px_-10px_rgb(192_38_211/0.8)]'
                    : 'text-ink hover:bg-white hover:shadow-sm'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${isActive ? 'bg-white/25' : 'bg-gradient-to-br from-violet-50 to-orange-50'}`}>
                    <Emoji name={emoji} size={24} pop />
                  </span>
                  <span className={small ? 'sr-only' : 'truncate'}>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <BottomExtras compact={small} />
      </div>
      <button type="button" className={`btn btn-ghost btn-sm mt-2 shrink-0 text-muted ${small ? '!px-0' : 'justify-start'}`} onClick={toggle} aria-label={small ? t.nav.expand : t.nav.collapse}>
        {small ? <PanelLeftOpen className="size-5" {...ICON} aria-hidden /> : <PanelLeftClose className="size-5" {...ICON} aria-hidden />}
        {!small && <span className="text-sm">{t.nav.collapse}</span>}
      </button>
    </nav>
  )
}

export function BottomBar({ onMore }: { onMore: () => void }) {
  const { profile } = useApp()
  const { t } = useI18n()
  const to = useTo()
  const items = useNavItems(profile?.role ?? 'officer').slice(0, 4)
  return (
    <nav aria-label="Tabs" className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/70 shadow-[0_-10px_30px_-18px_rgb(76_29_149/0.45)] lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ to: path, label, emoji }) => (
          <li key={path}>
            <NavLink
              to={to(path)}
              end={path === '/'}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 px-1 pt-1.5 pb-1 text-[11px] leading-tight font-semibold ${isActive ? 'text-[#6d28d9]' : 'text-muted'}`}
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid h-9 w-12 place-items-center rounded-2xl transition-all duration-300 ${
                      isActive ? 'grad-brand -translate-y-1 shadow-[0_8px_18px_-8px_rgb(192_38_211/0.9)]' : ''
                    }`}
                  >
                    <Emoji name={emoji} size={isActive ? 26 : 24} />
                  </span>
                  <span className="line-clamp-2 text-center">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" onClick={onMore} className="flex w-full flex-col items-center gap-0.5 px-1 pt-1.5 pb-1 text-[11px] font-semibold text-muted">
            <span className="grid h-9 w-12 place-items-center">
              <Emoji name="sparkles" size={24} />
            </span>
            {t.nav.more}
          </button>
        </li>
      </ul>
    </nav>
  )
}

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, wx, refresh } = useApp()
  const { t } = useI18n()
  const to = useTo()
  const items = useNavItems(profile?.role ?? 'officer')
  return (
    <Sheet open={open} onClose={onClose} title={t.nav.more}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LangSwitch />
        {profile && <span className="chip !py-1 font-semibold">{t.role[profile.role]}</span>}
        {wx && (
          <button type="button" className="btn btn-line btn-sm" onClick={() => (refresh(), onClose())}>
            <RefreshCw className="size-4" {...ICON} aria-hidden /> {t.header.refresh}
          </button>
        )}
      </div>
      <ul className="mb-3 grid grid-cols-2 gap-2">
        {items.map(({ to: path, label, emoji }) => (
          <li key={path}>
            <NavLink
              to={to(path)}
              end={path === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `lift flex items-center gap-2 rounded-2xl border px-3 py-2.5 font-semibold ${isActive ? 'grad-brand border-transparent text-white' : 'border-line bg-white'}`
              }
            >
              <Emoji name={emoji} size={26} pop /> {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <BottomExtras onDone={onClose} />
      <p className="mt-4 flex items-center gap-2 text-xs text-muted">
        <Emoji name="sunrise" size={18} /> {t.app.tagline}
      </p>
    </Sheet>
  )
}
