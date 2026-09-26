import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './ctx'
import { useI18n } from './i18n'
import { condColor, conditionOf } from './lib/risk'
import Entry from './screens/Entry'
import { Skel } from './ui/atoms'
import { Header } from './ui/Header'
import { BottomBar, MoreSheet, Sidebar } from './ui/Nav'
import { PlacePicker } from './ui/PlacePicker'

const Today = lazy(() => import('./screens/Today'))
const Schemes = lazy(() => import('./screens/Schemes'))
const Tasks = lazy(() => import('./screens/Tasks'))
const Report = lazy(() => import('./screens/Report'))
const WorkerToday = lazy(() => import('./screens/Worker').then((m) => ({ default: m.WorkerToday })))
const NearScreen = lazy(() => import('./screens/Worker').then((m) => ({ default: m.NearScreen })))
const AskScreen = lazy(() => import('./screens/Worker').then((m) => ({ default: m.AskScreen })))
const misc = () => import('./screens/Misc')
const MapScreen = lazy(() => misc().then((m) => ({ default: m.MapScreen })))
const NeedsScreen = lazy(() => misc().then((m) => ({ default: m.NeedsScreen })))
const ChecksScreen = lazy(() => misc().then((m) => ({ default: m.ChecksScreen })))
const HoursScreen = lazy(() => misc().then((m) => ({ default: m.HoursScreen })))
const AlertsScreen = lazy(() => misc().then((m) => ({ default: m.AlertsScreen })))
const SettingsScreen = lazy(() => misc().then((m) => ({ default: m.SettingsScreen })))
const SourcesScreen = lazy(() => misc().then((m) => ({ default: m.SourcesScreen })))
const NotFound = lazy(() => misc().then((m) => ({ default: m.NotFound })))
// standalone test route for Track 4 (hotspot fusion UI); not part of the real navigation yet
const HotspotLab = lazy(() => import('./screens/HotspotLab'))

function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skel className="h-56 w-full" />
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Skel className="h-[420px] !rounded-[22px]" />
        <Skel className="h-[420px] !rounded-[22px]" />
      </div>
    </div>
  )
}

export default function App() {
  const { profile, wx } = useApp()
  const { t } = useI18n()
  const { pathname, search } = useLocation()
  const [picker, setPicker] = useState(false)
  const [more, setMore] = useState(false)
  const hdr = useRef<HTMLDivElement>(null)

  // the sidebar sits under the sticky header: keep its offset equal to the header's real height
  useLayoutEffect(() => {
    const el = hdr.current
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--hdr', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [profile])

  useEffect(() => {
    window.scrollTo(0, 0)
    setMore(false)
  }, [pathname])

  // theme colour follows today's screen (condition)
  useEffect(() => {
    const d = wx?.data.days[0]
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', d ? condColor(conditionOf(d, wx.data.days[1])) : '#000c1f')
  }, [wx])

  if (pathname === '/welcome') return <Entry />
  if (!profile && pathname !== '/sources' && pathname !== '/hotspot-lab') return <Navigate to={{ pathname: '/welcome', search }} replace />
  const worker = profile?.role === 'worker'

  return (
    <div className="relative min-h-dvh">
      <a href="#main" className="sr-only-focusable fixed top-2 left-2 z-[200] rounded bg-ink px-3 py-2 text-white">
        {t.app.skip}
      </a>
      <div ref={hdr} className="sticky top-0 z-40">
        <Header onPlace={() => setPicker(true)} onMenu={() => setMore(true)} />
      </div>
      <div className="relative z-[1] flex">
        <Sidebar />
        <main id="main" className="min-w-0 flex-1 px-3 pt-5 pb-28 sm:px-5 lg:pb-8">
          <Suspense fallback={<Loading />}>
            {/* one comfortable reading width, centred on wide screens */}
            <div key={pathname} className="page mx-auto w-full max-w-[1480px]">
            <Routes>
              <Route path="/" element={worker ? <WorkerToday /> : <Today />} />
              <Route path="/map" element={<MapScreen />} />
              <Route path="/needs" element={<NeedsScreen />} />
              <Route path="/schemes" element={<Schemes />} />
              <Route path="/checks" element={<ChecksScreen />} />
              <Route path="/hours" element={<HoursScreen />} />
              <Route path="/alerts" element={<AlertsScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/report" element={<Report />} />
              <Route path="/near" element={<NearScreen />} />
              <Route path="/ask" element={<AskScreen />} />
              <Route path="/sources" element={<SourcesScreen />} />
              <Route path="/hotspot-lab" element={<HotspotLab />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </div>
          </Suspense>
        </main>
      </div>
      <BottomBar onMore={() => setMore(true)} />
      <PlacePicker open={picker} onClose={() => setPicker(false)} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
    </div>
  )
}
