import { Database, Eye, Lightbulb, Scale, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Panel, SectionTitle } from '../components/kit'
import { useI18n } from '../i18n'
import { aiMode } from '../lib/ai'
import { store } from '../lib/store'
import { useApp } from '../state'

function Block({ Icon, title, children }: { Icon: typeof Eye; title: string; children: ReactNode }) {
  return (
    <Panel>
      <h2 className="mb-3 flex items-center gap-2.5 font-display text-2xl font-extrabold">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon className="size-5" aria-hidden />
        </span>
        {title}
      </h2>
      {children}
    </Panel>
  )
}

const FORMULAS = [
  ['Outside-exposure (0-1)', '0.45 × population/p95 + 0.35 × mapped outdoor people/p95 + 0.20 × main-road km/p95'],
  ['Summer need', '(0.5 × canopy gap + 0.5 × ground heat) × (0.3 + 0.7 × exposure) × (0.4 + 0.6 × day heat)'],
  ['Winter need', 'exposure × (0.65 + 0.35 × shelter distance) × night cold × (0.75 + 0.25 × smoke-trap)'],
  ['Smoke-trap', 'night ventilation = boundary-layer height × wind; ≥1500 m²/s → 0, ≤100 m²/s → 1'],
  ['Night cold / day heat', 'feels-like 16°C → 0 … 4°C → 1   ·   feels-like 32°C → 0 … 46°C → 1'],
  ['Send help', 'each unit → max[(need + 0.15 × min(1, open reports / 3)) × people newly covered]'],
  ['Need shown in the app', '100 × need (higher = more need)'],
]

export default function Method() {
  const { city } = useApp()
  const { s, f } = useI18n()
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SectionTitle sub={s.how.intro}>{s.how.title}</SectionTitle>

      <Block Icon={Lightbulb} title={s.how.simpleTitle}>
        <ol className="space-y-3">
          {[s.how.simple1, s.how.simple2, s.how.simple3, s.how.simple4].map((t, i) => (
            <li key={i} className="flex gap-3 text-lg">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-display font-extrabold text-bg">{i + 1}</span>
              <span className="text-ink-2">{t}</span>
            </li>
          ))}
        </ol>
      </Block>

      <Block Icon={Eye} title={s.how.privacy}>
        <ul className="space-y-2.5">
          {[s.how.privacy1, s.how.privacy2, s.how.privacy3, s.how.privacy4, s.how.privacy5].map((t) => (
            <li key={t} className="rounded-2xl bg-surface-2 px-4 py-3 text-ink-2">{t}</li>
          ))}
        </ul>
      </Block>

      <Block Icon={Scale} title={s.how.formulas}>
        <dl className="space-y-3">
          {FORMULAS.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm font-bold">{k}</dt>
              <dd className="mt-1 overflow-x-auto rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs">{v}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block Icon={Database} title={s.how.sources}>
        <ul className="space-y-2 text-sm">
          {city &&
            Object.entries(city.meta.layers).map(([k, v]) => (
              <li key={k}>
                <b className="capitalize">{k}:</b> <span className="text-ink-2">{v}</span>
              </li>
            ))}
          <li><b>Weather:</b> <span className="text-ink-2">{s.how.weatherSrc}</span></li>
          <li><b>Grid:</b> <span className="text-ink-2">{f(s.how.grid, { n: city?.meta.cells ?? 0 })}</span></li>
        </ul>
      </Block>

      <Block Icon={TriangleAlert} title={s.how.limits}>
        <ul className="space-y-2.5">
          {[s.how.limit1, s.how.limit2, s.how.limit3, s.how.limit4].map((t) => (
            <li key={t} className="rounded-2xl bg-surface-2 px-4 py-3 text-ink-2">{t}</li>
          ))}
        </ul>
      </Block>

      <p className="text-center text-xs text-ink-3">
        AI: {aiMode()} · {store.mode === 'firebase' ? s.app.liveMode : s.app.demoMode}
      </p>
    </div>
  )
}
