import { BarChart3, BookOpen, Camera, HandHeart, Home as HomeIcon, Map, Menu, PhoneCall, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Brand } from './components/Brand'
import { LangToggle, SeasonToggle } from './components/kit'
import { useI18n } from './i18n'
import { store } from './lib/store'
import Home from './pages/Home'
import { useApp } from './state'

const MapPage = lazy(() => import('./pages/MapPage'))
const Report = lazy(() => import('./pages/Report'))
const Pulse = lazy(() => import('./pages/Pulse'))
const Match = lazy(() => import('./pages/Match'))
const Ledger = lazy(() => import('./pages/Ledger'))
const Method = lazy(() => import('./pages/Method'))

export default function App() {
  const { season, cityError } = useApp()
  const { s } = useI18n()
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()
  const fullBleed = pathname === '/map'

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', season === 'sardi' ? '#0a1230' : '#fff6ea')
  }, [season])
  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
  }, [pathname])

  const NAV = [
    { to: '/', label: s.nav.home, Icon: HomeIcon },
    { to: '/map', label: s.nav.map, Icon: Map },
    { to: '/report', label: s.nav.report, Icon: Camera },
    { to: '/match', label: s.nav.help, Icon: HandHeart },
    { to: '/pulse', label: s.nav.check, Icon: PhoneCall },
    { to: '/ledger', label: s.nav.results, Icon: BarChart3 },
    { to: '/method', label: s.nav.how, Icon: BookOpen },
  ]
  const TABS = [NAV[0], NAV[1], NAV[2], NAV[3], NAV[4]]

  return (
    <div className={`theme-${season} app-bg relative flex min-h-dvh flex-col`}>
      <div className="sky" aria-hidden />

      <header className="sticky top-0 z-40 border-b border-line/60 bg-glass backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <NavLink to="/" aria-label={s.nav.home}>
            <Brand />
          </NavLink>
          <nav className="ml-4 hidden items-center gap-1 xl:flex" aria-label="Main">
            {NAV.slice(1).map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                    isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <LangToggle />
            </div>
            <div className="sm:hidden">
              <LangToggle single />
            </div>
            <SeasonToggle compact />
            <button
              type="button"
              className="rounded-xl p-2 text-ink-2 hover:bg-surface-2 xl:hidden"
              aria-label={menu ? s.app.close : 'Menu'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </div>
        {menu && (
          <div className="border-t border-line/60 px-4 pb-4 xl:hidden">
            <nav className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-3" aria-label="Menu">
              {NAV.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-2xl border px-3 py-3 font-bold ${
                      isActive ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink'
                    }`
                  }
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      {cityError && (
        <div className="relative z-10 bg-critical px-4 py-2 text-center text-sm font-semibold text-white">
          {s.app.cityError}: {cityError}
        </div>
      )}

      <main className={`relative z-10 flex-1 ${fullBleed ? '' : 'mx-auto w-full max-w-7xl px-4 pt-6 pb-28 sm:pt-8 xl:pb-12'}`}>
        <Suspense fallback={<div className="p-16 text-center text-ink-3">{s.app.loading}</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/report" element={<Report />} />
            <Route path="/match" element={<Match />} />
            <Route path="/pulse" element={<Pulse />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/method" element={<Method />} />
            <Route path="*" element={<div className="p-16 text-center">{s.app.notFound}</div>} />
          </Routes>
        </Suspense>
      </main>

      {!fullBleed && (
        <footer className="relative z-10 hidden px-4 pb-6 text-center text-xs text-ink-3 xl:block">
          {s.app.name} · {s.app.tagline} · {store.mode === 'firebase' ? s.app.liveMode : s.app.demoMode}
        </footer>
      )}

      {/* phone tab bar with a raised 3D report button */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-glass backdrop-blur-xl xl:hidden pb-safe"
        aria-label="Tabs"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-1.5">
          {TABS.map(({ to, label, Icon }, i) =>
            i === 2 ? (
              <NavLink key={to} to={to} className="flex flex-col items-center gap-1" aria-label={label}>
                <span className="btn-3d btn-primary -mt-7 flex size-16 items-center justify-center rounded-[1.4rem]">
                  <Icon className="size-7" aria-hidden />
                </span>
                <span className="text-[11px] font-bold text-accent">{label}</span>
              </NavLink>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-bold ${isActive ? 'text-accent' : 'text-ink-3'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-accent-soft' : ''}`}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </div>
  )
}
