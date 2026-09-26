import {
  Bell, CalendarDays, ChevronDown, CircleCheckBig, ClipboardList, Database, FileText, House, Landmark, Map, MapPin, MessageSquareText,
  MoreHorizontal, Package, RefreshCw, Settings, ShieldCheck, UserRound, type LucideIcon,
} from 'lucide-react'
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
  Icon: LucideIcon
}

export function useNavItems(role: Role): Item[] {
  const { t } = useI18n()
  const today = { to: '/', label: t.nav.today, Icon: House }
  const map = { to: '/map', label: t.nav.map, Icon: Map }
  const settings = { to: '/settings', label: t.nav.settings, Icon: Settings }
  const checks = { to: '/checks', label: t.nav.checks, Icon: CircleCheckBig }
  const report = { to: '/report', label: t.nav.report, Icon: FileText }
  if (role === 'officer')
    return [
      today, map,
      { to: '/needs', label: t.nav.needs, Icon: ClipboardList },
      { to: '/schemes', label: t.nav.schemes, Icon: Landmark },
      checks,
      { to: '/hours', label: t.nav.hours, Icon: ShieldCheck },
      report,
      { to: '/alerts', label: t.nav.alerts, Icon: Bell },
      settings,
    ]
  if (role === 'partner') return [today, { to: '/tasks', label: t.nav.tasks, Icon: Package }, checks, map, report, settings]
  return [today, { to: '/near', label: t.nav.near, Icon: MapPin }, { to: '/ask', label: t.nav.ask, Icon: MessageSquareText }, settings]
}

/** Links keep ?pin / ?date / ?replay so every view stays shareable. */
function useTo() {
  const { search } = useLocation()
  return (pathname: string) => ({ pathname, search })
}

const PAST_EMOJI: Record<ReplayKind, EmojiName> = { smog: 'mask', summer: 'hot_face', double: 'fire', winter: 'cold_face' }

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

const ROW = 'flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium whitespace-nowrap text-[#dbe6f7] hover:bg-white/5'

function Group({ title, Icon, open, onToggle, children }: { title: string; Icon: LucideIcon; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" className={ROW} aria-expanded={open} onClick={onToggle}>
        <Icon className="size-6 shrink-0" strokeWidth={1.7} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
        <ChevronDown className={`size-4 shrink-0 text-[#6f82a6] transition-transform ${open ? 'rotate-180' : ''}`} {...ICON} aria-hidden />
      </button>
      {open && <ul className="mt-1 mb-2 ml-7 space-y-0.5 border-l border-[#16325c] pl-3">{children}</ul>}
    </div>
  )
}

function BottomExtras({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n()
  const { setProfile } = useApp()
  const nav = useNavigate()
  const to = useTo()
  const demo = useDemoPlaces()
  const [open, setOpen] = useState(false)
  // past days open when one is on screen; otherwise one tap away
  const [pastOpen, setPastOpen] = useState(() => !!demo.replay)
  return (
    <div className="space-y-0.5">
      <Group title={t.nav.demoPlaces} Icon={MapPin} open={open} onToggle={() => setOpen(!open)}>
        {demo.rows.map((r) => (
          <li key={r.key}>
            <button type="button" className="w-full rounded-lg px-2.5 py-1.5 text-left text-[14px] text-[#c7d3ea] hover:bg-white/5" onClick={() => (r.run(), onDone?.())}>
              {r.label}
            </button>
          </li>
        ))}
      </Group>
      <Group title={t.nav.pastDays} Icon={CalendarDays} open={pastOpen} onToggle={() => setPastOpen(!pastOpen)}>
        {demo.past.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              aria-current={r.active ? 'true' : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-snug ${r.active ? 'bg-[#0b3a2a] font-semibold text-white' : 'text-[#c7d3ea] hover:bg-white/5'}`}
              onClick={() => (r.run(), onDone?.())}
            >
              <Emoji name={PAST_EMOJI[r.key as ReplayKind]} size={18} /> <span>{r.label}</span>
            </button>
          </li>
        ))}
        {demo.replay && (
          <li>
            <button type="button" className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold text-[#4ade80] hover:bg-white/5" onClick={() => (demo.backLive(), onDone?.())}>
              {t.demoPlaces.backLive}
            </button>
          </li>
        )}
      </Group>
      <button
        type="button"
        className={ROW}
        onClick={() => {
          setProfile(null)
          onDone?.()
          nav(to('/welcome'))
        }}
      >
        <UserRound className="size-6 shrink-0" strokeWidth={1.7} aria-hidden /> {t.nav.switchRole}
      </button>
      <NavLink to={to('/sources')} onClick={onDone} className={ROW}>
        <Database className="size-6 shrink-0" strokeWidth={1.7} aria-hidden /> {t.nav.sources}
      </NavLink>
    </div>
  )
}

function NavItems({ items, onDone }: { items: Item[]; onDone?: () => void }) {
  const to = useTo()
  return (
    <ul className="space-y-1.5">
      {items.map(({ to: path, label, Icon }) => (
        <li key={path}>
          <NavLink
            to={to(path)}
            end={path === '/'}
            onClick={onDone}
            className={({ isActive }) =>
              `flex items-center gap-3.5 rounded-xl border px-4 py-3 text-[16px] transition-colors ${
                isActive
                  ? 'border-[#22c55e]/45 bg-gradient-to-r from-[#0b6b3f] to-[#075c36] font-semibold text-white shadow-[0_0_24px_-6px_rgb(34_197_94/0.55)]'
                  : 'border-transparent font-medium text-[#dbe6f7] hover:bg-white/5'
              }`
            }
          >
            <Icon className="size-6 shrink-0" strokeWidth={1.8} aria-hidden />
            <span className="truncate" title={label}>
              {label}
            </span>
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

export function Sidebar() {
  const { profile } = useApp()
  const items = useNavItems(profile?.role ?? 'officer')
  return (
    <nav
      aria-label="Main"
      className="sticky top-[var(--hdr,84px)] z-10 hidden h-[calc(100dvh-var(--hdr,84px))] w-[248px] shrink-0 flex-col border-r border-[#16325c] bg-[#001229] lg:flex"
    >
      <div className="flex-1 overflow-y-auto px-3 pt-4 pb-2">
        <NavItems items={items} />
        <div className="my-4 border-t border-[#16325c]" />
        <BottomExtras />
      </div>
      {/* the worker looking at the city, from the design */}
      <div aria-hidden className="relative h-[210px] shrink-0 overflow-hidden">
        <img src={`${import.meta.env.BASE_URL}art/worker-scene.png`} alt="" className="absolute inset-x-0 bottom-0 w-full object-cover object-top" draggable={false} />
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#001229] to-transparent" />
      </div>
    </nav>
  )
}

export function BottomBar({ onMore }: { onMore: () => void }) {
  const { profile } = useApp()
  const { t } = useI18n()
  const to = useTo()
  const items = useNavItems(profile?.role ?? 'officer').slice(0, 4)
  return (
    <nav aria-label="Tabs" className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-[#16325c] lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ to: path, label, Icon }) => (
          <li key={path}>
            <NavLink
              to={to(path)}
              end={path === '/'}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 px-1 pt-1.5 pb-1 text-[11px] leading-tight font-semibold ${isActive ? 'text-[#4ade80]' : 'text-[#93a4c3]'}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`grid h-8 w-12 place-items-center rounded-xl ${isActive ? 'bg-gradient-to-r from-[#0b6b3f] to-[#075c36] text-white' : ''}`}>
                    <Icon className="size-5" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="line-clamp-2 text-center">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" onClick={onMore} className="flex w-full flex-col items-center gap-0.5 px-1 pt-1.5 pb-1 text-[11px] font-semibold text-[#93a4c3]">
            <span className="grid h-8 w-12 place-items-center">
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
      <NavItems items={items} onDone={onClose} />
      <div className="my-3 border-t border-[#16325c]" />
      <BottomExtras onDone={onClose} />
    </Sheet>
  )
}
