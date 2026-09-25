import { ColumnLayer, TextLayer } from '@deck.gl/layers'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CityStatus, SectionTitle, TiltCard, WeatherChips } from '../components/kit'
import { MapView } from '../components/MapView'
import { useI18n } from '../i18n'
import { learnFromPulses } from '../lib/memory'
import { burningRisk, exposureDose, hoursFor, span, VULNERABILITY, type BurningRisk, type ExposureNode, type Group } from '../lib/nodes'
import { nodeKnowledge } from '../lib/protection'
import { dayHeat } from '../lib/scoring'
import { hhmm, makeScene, shadeProfile, sunHoursInShift, sunWindow } from '../lib/shade'
import { simulateWinter } from '../lib/replay'
import { useNodes } from '../lib/useNodes'
import { useApp } from '../state'

const LEVEL_TONE = { high: 'var(--color-critical)', medium: 'var(--color-serious)', low: 'var(--color-good)' } as const
const LEVEL_RGB = { high: [229, 72, 77], medium: [240, 115, 53], low: [18, 161, 80] } as const

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] font-semibold text-ink-2">
        <span>{label}</span>
        <span className="tabular">{Math.round(value * 100)}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  )
}

export default function Tonight() {
  const data = useNodes()
  const { season, weather, deliveries, pulses, reports } = useApp()
  const { s, f, lang, num } = useI18n()
  const beliefs = useMemo(() => learnFromPulses(deliveries, pulses), [deliveries, pulses])
  const [rateSource, setRateSource] = useState<'app' | 'replay'>('app')
  const replayRate = useMemo(() => (data ? simulateWinter(data.nights).nights.at(-1)!.heater.mean : 0.9), [data])
  const rate = rateSource === 'app' ? beliefs.heater.planValue : replayRate

  const winter = useMemo(() => {
    if (!data) return []
    return data.nodes
      .map((node) => {
        const k = nodeKnowledge(node, deliveries, pulses, reports)
        return { node, k, risk: burningRisk(node, weather, k.state, rate) }
      })
      .sort((a, b) => b.risk.score - a.risk.score)
  }, [data, weather, deliveries, pulses, reports, rate])

  // summer: hours in the sun at each spot on the hottest day, from the Shade Clock
  const summer = useMemo(() => {
    if (!data || season !== 'garmi') return []
    const heat = 0.4 + 0.6 * dayHeat(weather)
    return data.nodes
      .map((node) => {
        const profile = shadeProfile(makeScene(node), '2026-05-19')
        const sunH = sunHoursInShift(profile, node.summer.hours)
        const shiftH = span(node.summer.hours)
        let dose = 0
        for (const [g, n] of Object.entries(node.summer.people) as [Group, number][])
          dose += n * VULNERABILITY[g] * (g === 'commuter' ? hoursFor(g, node.summer) : sunH) * heat
        return { node, dose, sunH, shiftH, win: sunWindow(profile, node.summer.hours) }
      })
      .sort((a, b) => b.dose - a.dose)
  }, [data, season, weather])

  const whyText = (node: ExposureNode, r: BurningRisk, st: ReturnType<typeof nodeKnowledge>['state']) => {
    const parts = [f(s.tonight.whyCold, { t: Math.round(r.feelsLike) }), r.stagnation > 0.6 ? s.tonight.whyStill : s.tonight.whyWindy]
    const people = Object.values(node.winter.people).reduce((a, b) => a + (b ?? 0), 0)
    parts.push(f(s.tonight.whyPeople, { n: people, h: span(node.winter.hours) }))
    if ((node.winter.people.guard ?? 0) > 0)
      parts.push(
        st.heater === 'failed'
          ? f(s.tonight.whyHeaterFailed, { reason: s.reason[(st.failReason ?? 'other') as keyof typeof s.reason] })
          : st.heater === 'distributed'
            ? s.tonight.whyHeaterUnconfirmed
            : st.heater === 'working'
              ? s.tonight.whyHeaterWorking
              : s.tonight.whyNoHeater,
      )
    if ((node.winter.people.homeless ?? 0) > 0) parts.push(f(s.tonight.whyShelter, { km: node.winter.shelterKm.toFixed(1) }))
    return f(s.tonight.why, { parts: parts.join(', ') })
  }

  const layers = useMemo(() => {
    if (season === 'sardi') {
      const d = winter.map((w) => ({ ...w, pos: [w.node.lon, w.node.lat] as [number, number] }))
      return [
        new ColumnLayer<(typeof d)[number]>({
          id: 'risk', data: d, getPosition: (x) => x.pos, radius: 90, diskResolution: 24, extruded: true,
          getElevation: (x) => 60 + x.risk.score * 18, getFillColor: (x) => [...LEVEL_RGB[x.risk.level], 230] as [number, number, number, number],
          material: { ambient: 0.6, diffuse: 0.6 }, pickable: true, updateTriggers: { getElevation: [weather, rate], getFillColor: [weather, rate] },
        }),
        new TextLayer<(typeof d)[number]>({
          id: 'lbl', data: d, getPosition: (x) => [...x.pos, 60 + x.risk.score * 18 + 80] as [number, number, number],
          getText: (x) => String(x.risk.score), getSize: 16, getColor: [255, 255, 255, 255], fontWeight: 800,
          outlineWidth: 3, outlineColor: [0, 0, 0, 200], fontSettings: { sdf: true }, updateTriggers: { getText: [weather, rate] },
        }),
      ]
    }
    const max = Math.max(1, ...summer.map((x) => x.dose))
    const d = summer.map((x) => ({ ...x, pos: [x.node.lon, x.node.lat] as [number, number] }))
    return [
      new ColumnLayer<(typeof d)[number]>({
        id: 'dose', data: d, getPosition: (x) => x.pos, radius: 90, diskResolution: 24, extruded: true,
        getElevation: (x) => 60 + (x.dose / max) * 1800, getFillColor: [228, 87, 30, 230], material: { ambient: 0.6, diffuse: 0.6 },
      }),
    ]
  }, [season, winter, summer, weather, rate])

  if (!data) return <div className="p-16 text-center text-ink-3">{s.app.loading}</div>

  const msgUrl = (node: ExposureNode, r: BurningRisk) =>
    `https://wa.me/?text=${encodeURIComponent(f(s.tonight.msgText, { name: lang === 'hi' ? node.nameHi : node.name, t: Math.round(r.feelsLike) }))}`

  return (
    <div className="space-y-6">
      <SectionTitle sub={season === 'sardi' ? s.tonight.introSardi : s.tonight.introGarmi}>
        {season === 'sardi' ? s.tonight.titleSardi : s.tonight.titleGarmi}
      </SectionTitle>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="surface-3d space-y-4 p-5">
          <CityStatus />
          <WeatherChips />
          {season === 'sardi' && (
            <div className="space-y-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
              <div className="font-semibold">{s.tonight.rateFrom}</div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['app', f(s.tonight.rateApp, { p: `${Math.round(beliefs.heater.planValue * 100)}%` })],
                  ['replay', f(s.tonight.rateReplay, { p: `${Math.round(replayRate * 100)}%` })],
                ] as const).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={rateSource === k} onClick={() => setRateSource(k)}
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${rateSource === k ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-ink-2'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="block text-xs text-ink-3">{s.tonight.riskNote}</span>
            </div>
          )}
        </div>
        <div className="surface-3d overflow-hidden !p-0">
          <MapView className="relative h-[340px]" layers={layers as never[]} center={[26.212, 78.175]} zoom={12.4} dark={season === 'sardi'} pitch={50} bearing={-15} />
        </div>
      </div>

      {season === 'sardi' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {winter.map(({ node, k, risk }) => (
            <TiltCard key={node.id} className="surface-3d flex flex-col p-5" max={4}>
              <div className="pop flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-display text-lg font-extrabold">{lang === 'hi' ? node.nameHi : node.name}</div>
                  <div className="text-xs text-ink-3">{s.tonight.risk}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-4xl leading-none font-extrabold tabular" style={{ color: LEVEL_TONE[risk.level] }}>{risk.score}</div>
                  <div className="text-xs font-bold" style={{ color: LEVEL_TONE[risk.level] }}>{s.tonight[risk.level]}</div>
                </div>
              </div>
              <div className="pop mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <Bar label={s.tonight.cold} value={risk.cold} />
                <Bar label={s.tonight.still} value={risk.stagnation} />
                <Bar label={s.tonight.outside} value={risk.exposure} />
                <Bar label={s.tonight.gap} value={risk.deficit} />
              </div>
              <p className="pop mt-3 flex-1 text-sm text-ink-2">{whyText(node, risk, k.state)}</p>
              <div className="pop mt-4 flex flex-wrap gap-2">
                <a href={msgUrl(node, risk)} target="_blank" rel="noreferrer" className="btn-3d px-3 py-2 text-sm text-white"
                  style={{ background: '#25d366', ['--edge' as string]: '#128c4b' }}>
                  <MessageCircle className="size-4" aria-hidden /> {s.tonight.msg}
                </a>
                <Link to={`/node/${node.id}`} className="btn-3d btn-soft px-3 py-2 text-sm">
                  {s.tonight.open} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </TiltCard>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summer.map(({ node, dose, win }) => (
            <Link key={node.id} to={`/node/${node.id}`} className="block rounded-3xl">
              <TiltCard className="surface-3d h-full p-5" max={4}>
                <div className="pop font-display text-lg font-extrabold">{lang === 'hi' ? node.nameHi : node.name}</div>
                <div className="pop mt-2 font-display text-3xl font-extrabold text-accent tabular">{num(Math.round(dose))}</div>
                <div className="pop text-sm text-ink-2">{f(s.tonight.dose, { n: '' }).trim()}</div>
                <p className="pop mt-2 text-sm">
                  {win ? f(s.tonight.sunFrom, { from: hhmm(win[0]), to: hhmm(win[1]) }) : s.tonight.noSun}
                </p>
                <p className="pop text-xs text-ink-3">{f(s.node.dose, { n: num(Math.round(exposureDose(node.summer))) })}</p>
              </TiltCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
