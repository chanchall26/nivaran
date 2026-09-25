import {
  Bell, CalendarClock, CircleCheckBig, ClipboardList, Database, FileText, HandHelping, House, Landmark, ListChecks, Map, MapPin, Megaphone,
  MoreHorizontal, PanelLeftClose, PanelLeftOpen, RefreshCw, Repeat, Settings, ShieldCheck, Sprout, type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { REPLAY_KINDS, replayPlace, type ReplayKind } from '../lib/live'
import { PRESETS, type Place } from '../lib/place'
import type { Role } from '../lib/profile'
import { ICON } from './atoms'
import { LangSwitch } from './Header'
import { Sheet } from './Sheet'

interface Item {
  to: string
  label: string
  Icon: LucideIcon
}

export function useNavItems(role: Role): Item[] {
  const { t } = useI18n()
  const today = { to: '/', label: t.nav.today, Icon: House }
  const map = { to: '/map', label: t.nav.map, Icon: Map }
  const settings = { to: '/settings', label: t.nav.settings, Icon: Settings }
  const checks = { to: '/checks', label: t.nav.checks, Icon: CircleCheckBig }
  const plant = { to: '/plant', label: t.nav.plant, Icon: Sprout }
  const report = { to: '/report', label: t.nav.report, Icon: FileText }
  if (role === 'officer')
    return [
      today, map,
      { to: '/needs', label: t.nav.needs, Icon: ListChecks },
      { to: '/schemes', label: t.nav.schemes, Icon: Landmark },
      checks,
      { to: '/hours', label: t.nav.hours, Icon: ShieldCheck },
      plant,
      report,
      { to: '/alerts', label: t.nav.alerts, Icon: Bell },
      settings,
    ]
  if (role === 'partner') return [today, { to: '/tasks', label: t.nav.tasks, Icon: ClipboardList }, checks, map, report, plant, settings]
  return [today, { to: '/near', label: t.nav.near, Icon: MapPin }, { to: '/ask', label: t.nav.ask, Icon: Megaphone }, settings]
}

/** Links keep ?pin / ?date / ?replay so every view stays shareable. */
function useTo() {
  const { search } = useLocation()
  return (pathname: string) => ({ pathname, search })
}

function useDemoPlaces() {
  const { t } = useI18n()
  const { setPlace, replay } = useApp()
  const go = (p: Place, r: ReplayKind | null = null) => setPlace(p, { replay: r })
  const rows = [
    { key: 'g', label: t.demoPlaces.gwalior, run: () => go(PRESETS.gwalior), active: false },
    { key: 'd', label: t.demoPlaces.delhi, run: () => go(PRESETS.delhi), active: false },
    { key: 'l', label: t.demoPlaces.leh, run: () => go(PRESETS.leh), active: false },
  ]
  const past = REPLAY_KINDS.map((k) => ({ key: k, label: t.pastDays[k], run: () => go(PRESETS[replayPlace(k)], k), active: replay === k }))
  return { rows, past, replay, backLive: () => go(PRESETS[replay ? replayPlace(replay) : 'gwalior']) }
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
        <NavLink to={to('/sources')} className="btn btn-ghost btn-sm !px-2" title={t.nav.sources} aria-label={t.nav.sources}>
          <Database className="size-5" {...ICON} aria-hidden />
        </NavLink>
      </div>
    )
  return (
    <div className="space-y-1 border-t border-line pt-3 text-sm">
      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 font-semibold hover:bg-mist" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MapPin className="size-4" {...ICON} aria-hidden /> {t.nav.demoPlaces}
      </button>
      {open && (
        <ul className="space-y-0.5 pl-4">
          {demo.rows.map((r) => (
            <li key={r.key}>
              <button type="button" className={`w-full rounded-md px-3 py-1.5 text-left hover:bg-mist ${r.active ? 'font-bold' : ''}`} onClick={() => (r.run(), onDone?.())}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 font-semibold hover:bg-mist" aria-expanded={pastOpen} onClick={() => setPastOpen(!pastOpen)}>
        <CalendarClock className="size-4" {...ICON} aria-hidden /> {t.nav.pastDays}
      </button>
      {pastOpen && (
        <ul className="space-y-0.5 pl-4">
          {demo.past.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                aria-current={r.active ? 'true' : undefined}
                className={`w-full rounded-md px-3 py-1.5 text-left hover:bg-mist ${r.active ? 'bg-mist font-bold' : ''}`}
                onClick={() => (r.run(), onDone?.())}
              >
                {r.label}
              </button>
            </li>
          ))}
          {demo.replay && (
            <li>
              <button type="button" className="w-full rounded-md px-3 py-1.5 text-left font-semibold text-[#1f6feb] hover:bg-mist" onClick={() => (demo.backLive(), onDone?.())}>
                {t.demoPlaces.backLive}
              </button>
            </li>
          )}
        </ul>
      )}
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 font-semibold hover:bg-mist"
        onClick={() => {
          setProfile(null)
          onDone?.()
          nav(to('/welcome'))
        }}
      >
        <Repeat className="size-4" {...ICON} aria-hidden /> {t.nav.switchRole}
      </button>
      <NavLink to={to('/sources')} onClick={onDone} className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold hover:bg-mist">
        <Database className="size-4" {...ICON} aria-hidden /> {t.nav.sources}
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
      className={`sticky top-[var(--hdr,92px)] hidden h-[calc(100dvh-var(--hdr,92px))] shrink-0 flex-col border-r border-line bg-paper py-3 lg:flex ${small ? 'w-16 px-2' : 'w-60 px-3'}`}
    >
      <ul className="flex-1 space-y-0.5 overflow-y-auto">
        {items.map(({ to: path, label, Icon }) => (
          <li key={path}>
            <NavLink
              to={to(path)}
              end={path === '/'}
              title={small ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg py-2 font-semibold ${small ? 'justify-center px-0' : 'px-3'} ${
                  isActive ? 'bg-ink text-white' : 'text-ink hover:bg-mist'
                }`
              }
            >
              <Icon className="size-5 shrink-0" {...ICON} aria-hidden />
              <span className={small ? 'sr-only' : 'truncate'}>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <BottomExtras compact={small} />
      <button type="button" className={`btn btn-ghost btn-sm mt-2 text-muted ${small ? '!px-0' : 'justify-start'}`} onClick={toggle} aria-label={small ? t.nav.expand : t.nav.collapse}>
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
    <nav aria-label="Tabs" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ to: path, label, Icon }) => (
          <li key={path}>
            <NavLink
              to={to(path)}
              end={path === '/'}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 px-1 pt-2 pb-1 text-[11px] leading-tight font-semibold ${isActive ? 'text-ink' : 'text-muted'}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-7 w-11 items-center justify-center rounded-full ${isActive ? 'bg-ink text-white' : ''}`}>
                    <Icon className="size-5" {...ICON} aria-hidden />
                  </span>
                  <span className="line-clamp-2 text-center">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" onClick={onMore} className="flex w-full flex-col items-center gap-0.5 px-1 pt-2 pb-1 text-[11px] font-semibold text-muted">
            <span className="flex h-7 w-11 items-center justify-center">
              <MoreHorizontal className="size-5" {...ICON} aria-hidden />
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
        {items.map(({ to: path, label, Icon }) => (
          <li key={path}>
            <NavLink
              to={to(path)}
              end={path === '/'}
              onClick={onClose}
              className={({ isActive }) => `flex items-center gap-2 rounded-lg border px-3 py-2.5 font-semibold ${isActive ? 'border-ink bg-ink text-white' : 'border-line'}`}
            >
              <Icon className="size-5" {...ICON} aria-hidden /> {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <BottomExtras onDone={onClose} />
      <p className="mt-4 flex items-center gap-2 text-xs text-muted">
        <HandHelping className="size-4" {...ICON} aria-hidden /> {t.app.tagline}
      </p>
    </Sheet>
  )
}
