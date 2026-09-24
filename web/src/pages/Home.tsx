import { ArrowRight, Camera, HandHeart, Map, PhoneCall, Search, Send, ShieldCheck } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BigStat, BtnLink, CityStatus, Panel, SectionTitle, TiltCard, WeatherChips } from '../components/kit'
import { SeasonScene } from '../components/Scene'
import { useI18n } from '../i18n'
import { computeLedger } from '../lib/impact'
import { band, score } from '../lib/scoring'
import { useApp } from '../state'

/** A glossy 3D icon block. */
function IconBlock({ children, hue }: { children: ReactNode; hue: string }) {
  return (
    <span
      className="pop flex size-14 items-center justify-center rounded-2xl text-white"
      style={{
        background: `linear-gradient(145deg, ${hue}, color-mix(in oklab, ${hue} 70%, black))`,
        boxShadow: `0 5px 0 color-mix(in oklab, ${hue} 55%, black), 0 12px 20px -8px ${hue}`,
      }}
    >
      {children}
    </span>
  )
}

export default function Home() {
  const { city, season, weather, deliveries, pulses, reports } = useApp()
  const { s, f, num } = useI18n()

  const stats = useMemo(() => {
    if (!city) return null
    const outside = city.places.filter((p) => p.kind !== 'shelter').reduce((a, p) => a + (p.staff ?? 1), 0)
    const withC = city.cells.filter((c) => c.canopy != null)
    const canopy = withC.reduce((a, c) => a + (c.canopy ?? 0) * c.pop, 0) / withC.reduce((a, c) => a + c.pop, 0)
    const needy = city.cells.filter((c) => {
      const b = band(score(season, c, city.norms, weather).score)
      return b === 'critical' || b === 'serious'
    }).length
    return { outside, canopy, needy }
  }, [city, season, weather])

  const ledger = useMemo(() => computeLedger(deliveries, pulses, reports), [deliveries, pulses, reports])

  const actions = [
    { to: '/map', Icon: Map, title: s.nav.map, text: s.home.doMap, hue: '#2f6fd6' },
    { to: '/report', Icon: Camera, title: s.nav.report, text: s.home.doReport, hue: '#e4571e' },
    { to: '/match', Icon: HandHeart, title: s.nav.help, text: s.home.doHelp, hue: '#12a150' },
    { to: '/pulse', Icon: PhoneCall, title: s.nav.check, text: s.home.doCheck, hue: '#8b5cf6' },
  ]
  const steps = [
    { Icon: Search, title: s.home.step1, text: s.home.step1d },
    { Icon: Send, title: s.home.step2, text: s.home.step2d },
    { Icon: ShieldCheck, title: s.home.step3, text: s.home.step3d },
  ]

  return (
    <div className="space-y-14 sm:space-y-20">
      {/* hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="anim-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-sm font-bold text-accent">
            <span className="size-2 rounded-full bg-accent" /> {s.home.kicker}
          </p>
          <h1 className="mt-4 font-display text-5xl leading-[1.02] font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            <span className={season === 'garmi' ? 'text-accent' : ''}>{s.home.title1}</span>
            <br />
            <span className={season === 'sardi' ? 'text-accent' : ''}>{s.home.title2}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{s.home.intro}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <BtnLink to="/map" size="lg">
              <Map className="size-5" aria-hidden /> {s.home.ctaMap}
            </BtnLink>
            <BtnLink to="/report" size="lg" variant="soft">
              <Camera className="size-5" aria-hidden /> {s.home.ctaReport}
            </BtnLink>
          </div>
        </div>
        <div className="anim-rise [animation-delay:120ms]">
          <SeasonScene />
          <p className="mt-3 text-center text-xs text-ink-3">{s.home.tapFlip}</p>
        </div>
      </section>

      {/* right now */}
      <Panel className="!p-0 overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-ink-3">{s.home.todayTitle}</h2>
            <CityStatus big />
            <WeatherChips />
          </div>
          {stats && city && (
            <div className="grid grid-cols-2 gap-3">
              <BigStat label={s.home.statPeople} value={`${num(city.meta.population / 1e5, 1)} L`} sub="Meta HRSL" />
              <BigStat label={s.home.statOutside} value={num(stats.outside)} />
              {season === 'garmi' ? (
                <BigStat label={s.home.statTrees} value={`${Math.round(stats.canopy * 100)}%`} sub={s.home.statTreesSub} tone="var(--accent)" />
              ) : (
                <BigStat
                  label={s.home.statShelters}
                  value={city.places.filter((p) => p.kind === 'shelter').length}
                  sub={s.home.statSheltersSub}
                  tone="var(--cool)"
                />
              )}
              <BigStat
                label={s.home.statNeedy}
                value={num(stats.needy)}
                sub={f(s.home.statNeedySub, { n: city.meta.cells })}
                tone="var(--color-critical)"
              />
            </div>
          )}
        </div>
      </Panel>

      {/* what can you do */}
      <section>
        <SectionTitle>{s.home.doTitle}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(({ to, Icon, title, text, hue }) => (
            <Link key={to} to={to} className="group block rounded-3xl">
              <TiltCard className="surface-3d h-full p-5">
                <IconBlock hue={hue}>
                  <Icon className="size-7" aria-hidden />
                </IconBlock>
                <h3 className="pop mt-4 font-display text-xl font-extrabold">{title}</h3>
                <p className="pop mt-1 text-ink-2">{text}</p>
                <span className="pop mt-4 inline-flex items-center gap-1 font-bold text-accent">
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </TiltCard>
            </Link>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section>
        <SectionTitle>{s.home.stepsTitle}</SectionTitle>
        <ol className="relative grid gap-4 md:grid-cols-3">
          <div aria-hidden className="absolute top-9 right-[16%] left-[16%] hidden h-1 rounded-full bg-gradient-to-r from-accent via-cool to-good opacity-40 md:block" />
          {steps.map(({ Icon, title, text }, i) => (
            <li key={title} className="relative">
              <TiltCard className="surface-3d h-full p-5 text-center" max={5}>
                <span className="pop relative mx-auto flex size-14 items-center justify-center rounded-full bg-ink font-display text-2xl font-extrabold text-bg shadow-[0_5px_0_rgb(var(--shade)/0.4)]">
                  {i + 1}
                </span>
                <h3 className="pop mt-3 flex items-center justify-center gap-2 font-display text-xl font-extrabold">
                  <Icon className="size-5 text-accent" aria-hidden /> {title}
                </h3>
                <p className="pop mt-1 text-ink-2">{text}</p>
              </TiltCard>
            </li>
          ))}
        </ol>
      </section>

      {(ledger.byItem.heater.checked > 0 || ledger.byItem.sapling.checked > 0) && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-extrabold">{s.home.resultsTitle}</h2>
              <p className="mt-1 text-lg text-ink-2">
                {f(s.home.resultsLine, {
                  w: ledger.byItem.heater.working, c: ledger.byItem.heater.checked,
                  s: ledger.byItem.sapling.working, sc: ledger.byItem.sapling.checked, p: ledger.peopleCovered,
                })}
              </p>
            </div>
            <BtnLink to="/ledger" variant="soft">
              {s.home.seeResults} <ArrowRight className="size-4" aria-hidden />
            </BtnLink>
          </div>
        </Panel>
      )}
    </div>
  )
}
