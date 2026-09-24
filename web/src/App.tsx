import { BookOpen, Camera, LayoutDashboard, Map, Menu, PhoneCall, Shuffle, X } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { SeasonSwitch } from './components/ui'
import { store } from './lib/store'
import Home from './pages/Home'
import { useApp } from './state'

const MapPage = lazy(() => import('./pages/MapPage'))
const Report = lazy(() => import('./pages/Report'))
const Pulse = lazy(() => import('./pages/Pulse'))
const Match = lazy(() => import('./pages/Match'))
const Ledger = lazy(() => import('./pages/Ledger'))
const Method = lazy(() => import('./pages/Method'))

const NAV = [
  { to: '/map', label: 'Bahar-Log Map', Icon: Map },
  { to: '/report', label: 'Report', Icon: Camera },
  { to: '/match', label: 'Match', Icon: Shuffle },
  { to: '/pulse', label: 'Pulse', Icon: PhoneCall },
  { to: '/ledger', label: 'Impact', Icon: LayoutDashboard },
  { to: '/method', label: 'Method', Icon: BookOpen },
]

export default function App() {
  const { season, cityError } = useApp()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const fullBleed = pathname === '/map'

  return (
    <div className={`season-${season} flex min-h-full flex-col`}>
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="text-xl font-extrabold tracking-tight">Barahmasa</span>
            <span className="hidden text-sm text-ink-3 sm:inline">· Gwalior</span>
          </NavLink>
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                    isActive ? 'bg-[var(--accent-100)] text-[var(--accent-700)]' : 'text-ink-2 hover:bg-black/5'
                  }`
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SeasonSwitch />
            <button
              type="button"
              className="rounded-lg p-2 hover:bg-black/5 lg:hidden"
              aria-label={open ? 'Menu band karo' : 'Menu kholo'}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="grid grid-cols-2 gap-1 border-t border-line px-4 py-2 lg:hidden" aria-label="Main mobile">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-[var(--accent-100)] text-[var(--accent-700)]' : 'text-ink-2'
                  }`
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {cityError && (
        <div className="bg-critical px-4 py-2 text-center text-sm text-white">City data load nahi hua: {cityError}</div>
      )}

      <main className={fullBleed ? 'flex-1' : 'mx-auto w-full max-w-7xl flex-1 px-4 py-6'}>
        <Suspense fallback={<div className="p-10 text-center text-ink-3">Load ho raha hai…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/report" element={<Report />} />
            <Route path="/match" element={<Match />} />
            <Route path="/pulse" element={<Pulse />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/method" element={<Method />} />
            <Route path="*" element={<div className="p-10 text-center">Ye page nahi mila.</div>} />
          </Routes>
        </Suspense>
      </main>

      {!fullBleed && (
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-ink-3">
          Barahmasa · Garmi mein chhaya, sardi mein garmahat · Data: OSM, ESA WorldCover, Landsat, Meta HRSL, Open-Meteo ·{' '}
          Storage: {store.mode === 'firebase' ? 'Firebase' : 'is browser mein (demo mode)'}
        </footer>
      )}
    </div>
  )
}
