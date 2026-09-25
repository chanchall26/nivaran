import { GeoJsonLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { Moon, PhoneCall, Sun } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BtnLink, Panel, SourceTag } from '../components/kit'
import { MapView } from '../components/MapView'
import { useI18n } from '../i18n'
import { OPTIONS, type OptionKind } from '../lib/budget'
import { learnFromPulses } from '../lib/memory'
import { burningRisk, exposureDose, span, VULNERABILITY, type Group } from '../lib/nodes'
import { nodeKnowledge } from '../lib/protection'
import { bestMove, hhmm, istTime, makeScene, shadeFraction, shadeProfile, shadowsAt, sunHoursInShift, sunWindow } from '../lib/shade'
import { useNodes } from '../lib/useNodes'
import { useApp } from '../state'

const HOT_DAY = '2026-05-19'
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

export default function NodePage() {
  const { id } = useParams()
  const data = useNodes()
  const { season, weather, typicalWeather, deliveries, pulses, reports } = useApp()
  const { s, f, lang, num } = useI18n()
  const node = data?.nodes.find((n) => n.id === id) ?? null
  const [day, setDay] = useState(HOT_DAY)
  const [minutes, setMinutes] = useState(14 * 60)
  const beliefs = useMemo(() => learnFromPulses(deliveries, pulses), [deliveries, pulses])

  const scene = useMemo(() => (node ? makeScene(node) : null), [node])
  const profile = useMemo(() => (scene ? shadeProfile(scene, day) : []), [scene, day])
  const move = useMemo(() => (scene ? bestMove(scene, day, 40, [11, 17]) : null), [scene, day])
  const shadows = useMemo(() => (scene ? shadowsAt(scene, istTime(day, minutes)) : null), [scene, day, minutes])

  const layers = useMemo(() => {
    if (!scene || !shadows || !node || !move) return []
    const ll = scene.proj.toLonLat
    return [
      new PolygonLayer({
        id: 'shadows', data: shadows.buildings, getPolygon: (p: [number, number][]) => p.map(ll),
        getFillColor: [20, 30, 70, 90], stroked: false,
      }),
      new ScatterplotLayer({
        id: 'tree-shadows', data: shadows.trees, getPosition: (t: { c: [number, number] }) => ll(t.c), getRadius: 4,
        radiusUnits: 'meters', getFillColor: [20, 30, 70, 80],
      }),
      new PolygonLayer({
        id: 'buildings', data: node.buildings, getPolygon: (b: { c: [number, number][] }) => b.c, extruded: true,
        getElevation: (b: { h: number }) => b.h, getFillColor: [236, 226, 210, 255], getLineColor: [150, 130, 110, 255],
        material: { ambient: 0.55, diffuse: 0.7 },
      }),
      new ScatterplotLayer({
        id: 'trees', data: node.trees, getPosition: (t: [number, number]) => [t[0], t[1], 6], getRadius: 4, radiusUnits: 'meters',
        getFillColor: [63, 155, 58, 230],
      }),
      new GeoJsonLayer({
        id: 'move-line', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[node.lon, node.lat], move.lonLat] } } as GeoJSON.Feature,
        getLineColor: [18, 161, 80, 255], lineWidthMinPixels: 3, visible: move.dist > 0,
      }),
      new ScatterplotLayer({
        id: 'spots', data: [{ p: [node.lon, node.lat], c: [228, 87, 30] }, ...(move.dist > 0 ? [{ p: move.lonLat, c: [18, 161, 80] }] : [])],
        getPosition: (d: { p: [number, number] }) => d.p, getRadius: 9, radiusUnits: 'pixels',
        getFillColor: (d: { c: number[] }) => [...d.c, 255] as [number, number, number, number], stroked: true,
        getLineColor: [255, 255, 255, 255], lineWidthMinPixels: 3,
      }),
    ]
  }, [scene, shadows, node, move])

  if (!data) return <div className="p-16 text-center text-ink-3">{s.app.loading}</div>
  if (!node || !scene || !move) return <div className="p-16 text-center">{s.app.notFound}</div>

  const k = nodeKnowledge(node, deliveries, pulses, reports)
  // the winter panel always shows a winter night: tonight's weather in winter, a normal January night otherwise
  const winterWeather = season === 'sardi' ? weather : typicalWeather
  const risk = burningRisk(node, winterWeather, k.state, beliefs.heater.planValue)
  const win = sunWindow(profile, node.summer.hours)
  const sunH = sunHoursInShift(profile, node.summer.hours)
  const nowShade = shadows ? shadeFraction(scene.spot, shadows) : 0

  const people = (p: Partial<Record<Group, number>>) =>
    (Object.entries(p) as [Group, number][]).filter(([, n]) => n).map(([g, n]) => `${n} ${s.grp[g]}`).join(', ')

  // what-if options for the summer spot; people-hours per day, with the learned range
  const stayers = (Object.entries(node.summer.people) as [Group, number][]).filter(([g]) => g !== 'commuter')
  const weighted = (hrs: number, cap = Infinity) => {
    let left = cap
    let v = 0
    for (const [g, n] of stayers) {
      const take = Math.min(n, left)
      v += take * hrs * VULNERABILITY[g]
      left -= take
    }
    return v
  }
  const option = (kind: OptionKind, units: number, hours: number, cap: number) => {
    const spec = OPTIONS[kind]
    const b = spec.memory ? beliefs[spec.memory] : null
    const base = weighted(hours, cap * units) * spec.relief
    return {
      kind, cost: units * spec.unitCost,
      mid: base * (b ? b.planValue : 0.95),
      lo: base * (b ? b.lo : 0.85) * (1 - spec.spread),
      hi: base * (b ? b.hi : 1) * (1 + spec.spread),
      horizon: spec.horizon,
    }
  }
  const nPeople = stayers.reduce((a, [, n]) => a + n, 0)
  const nets = Math.max(1, Math.ceil(nPeople / OPTIONS.shade_net.covers))
  const opts = [
    ...(move.gain > 0.25 ? [{ ...option('move_spot', 1, move.gain, 99), cost: 0 }] : []),
    option('shade_net', nets, sunH, OPTIONS.shade_net.covers),
    ...(!node.summer.water ? [option('water_pot', 1, span(node.summer.hours), OPTIONS.water_pot.covers)] : []),
    ...((node.summer.people.guard ?? 0) > 0 ? [option('cabin', 1, sunH, 2)] : []),
    { ...option('sapling', 4, sunH, 24), mid: 0, lo: 0, hi: 0 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-accent">{s.node.same}</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold">{lang === 'hi' ? node.nameHi : node.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <SourceTag source={node.source} /> {s.node.synthetic}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* winter night */}
        <Panel className="!bg-[#101a3d] text-[#eef1ff] [--ink-2:#b8c2e8] [--ink-3:#8390bd]">
          <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold"><Moon className="size-6 text-[#8fbcff]" /> {s.node.winter}</h2>
          <p className="mt-1 text-sm text-ink-2">{people(node.winter.people)} · {f(s.node.hours, { from: node.winter.hours[0], to: node.winter.hours[1], h: span(node.winter.hours) })}</p>
          <p className="text-xs text-ink-3">{f(s.node.dose, { n: num(Math.round(exposureDose(node.winter))) })}</p>
          <div className="mt-4 flex items-end gap-4">
            <div>
              <div className="text-xs text-ink-3">{s.tonight.risk}</div>
              <div className="font-display text-5xl font-extrabold tabular">{risk.score}</div>
            </div>
            <div className="text-sm">
              {s.tonight.cold} {Math.round(risk.cold * 100)} · {s.tonight.still} {Math.round(risk.stagnation * 100)} ·{' '}
              {s.tonight.gap} {Math.round(risk.deficit * 100)}
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
              <dt className="text-ink-3">{s.node.heater}</dt>
              <dd className="font-bold">
                {k.state.heater === 'failed'
                  ? f(s.node.heaterFailed, { reason: s.reason[(k.state.failReason ?? 'other') as keyof typeof s.reason] })
                  : k.state.heater === 'working' ? s.node.heaterWorking : k.state.heater === 'distributed' ? s.node.heaterDistributed : s.node.heaterNone}
              </dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
              <dt className="text-ink-3">{s.node.lastCheck}</dt>
              <dd className="font-bold">{k.lastPulse ? `“${k.lastPulse.answer}”` : s.node.noCheck}</dd>
            </div>
          </dl>
          <Link to="/pulse" className="btn-3d mt-4 px-4 py-2.5 text-sm" style={{ background: '#ff8a3d', color: '#1b0d03', ['--edge' as string]: '#b8501a' }}>
            <PhoneCall className="size-4" /> {s.node.callNow}
          </Link>
        </Panel>

        {/* summer day */}
        <Panel className="!bg-[#fff2e2] text-[#2b1608] [--ink-2:#6b4a33] [--ink-3:#9a7b63]">
          <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold"><Sun className="size-6 text-[#e4571e]" /> {s.node.summer}</h2>
          <p className="mt-1 text-sm text-ink-2">{people(node.summer.people)} · {f(s.node.hours, { from: node.summer.hours[0], to: node.summer.hours[1], h: span(node.summer.hours) })}</p>
          <p className="text-xs text-ink-3">{f(s.node.dose, { n: num(Math.round(exposureDose(node.summer))) })}</p>
          <p className="mt-4 font-display text-2xl font-extrabold">
            {win ? f(s.node.inSun, { from: hhmm(win[0]), to: hhmm(win[1]) }) : s.node.allShade}
          </p>
          <p className="mt-1 text-sm">
            {move.dist > 0 && move.gain > 0.25 ? f(s.node.optMove, { d: Math.round(move.dist) }) + ` · +${move.gain.toFixed(1)} h` : s.node.optMoveNone}
          </p>
        </Panel>
      </div>

      {/* Shade Clock */}
      <Panel className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="font-display text-2xl font-extrabold">{s.node.shadeClock}</h2>
            <p className="text-sm text-ink-2">{s.node.shadeIntro}</p>
          </div>
          <div className="flex gap-2 text-sm">
            {[[HOT_DAY, s.node.hottest], [todayIst(), s.node.todayD]].map(([d, label]) => (
              <button key={d} type="button" aria-pressed={day === d} onClick={() => setDay(d)}
                className={`rounded-full border px-3 py-1.5 font-bold ${day === d ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-ink-2'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <MapView className="relative h-[380px]" layers={layers as never[]} center={[node.lat, node.lon]} zoom={17.2} pitch={55} bearing={-20} />
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="w-14 font-display text-lg font-extrabold tabular">{hhmm(minutes)}</span>
            <input type="range" min={6 * 60} max={19 * 60} step={10} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]" aria-label={s.node.time} />
            <span className="w-40 text-right text-sm text-ink-2">{f(s.node.shadeNow, { p: Math.round(nowShade * 100) })}</span>
          </div>
          {/* 30-minute strip: dark = shade, bright = sun */}
          <div className="flex gap-0.5" role="img" aria-label={win ? f(s.node.inSun, { from: hhmm(win[0]), to: hhmm(win[1]) }) : s.node.allShade}>
            {profile.map((p) => (
              <button key={p.minutes} type="button" onClick={() => setMinutes(p.minutes)} title={`${hhmm(p.minutes)} · ${Math.round(p.shade * 100)}%`}
                className="h-7 flex-1 rounded-sm"
                style={{ background: !p.sunUp ? '#2a3561' : `color-mix(in oklab, #ffb52e ${Math.round((1 - p.shade) * 100)}%, #3b4a7a)`,
                  outline: Math.abs(p.minutes - minutes) < 15 ? '2px solid var(--ink)' : 'none' }} />
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-ink-3"><span>06:00</span><span>12:00</span><span>19:00</span></div>
        </div>
      </Panel>

      {/* options */}
      <Panel>
        <h2 className="mb-3 font-display text-2xl font-extrabold">{s.node.options}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr><th className="py-2 pr-3" /><th className="py-2 pr-3">{s.node.cost}</th><th className="py-2 pr-3">{s.node.benefit}</th><th className="py-2">{s.node.when}</th></tr>
            </thead>
            <tbody>
              {opts.map((o) => (
                <tr key={o.kind} className="border-t border-line">
                  <td className="py-3 pr-3 font-bold">{o.kind === 'move_spot' ? f(s.node.optMove, { d: Math.round(move.dist) }) : s.opt[o.kind]}</td>
                  <td className="py-3 pr-3 tabular">{o.cost === 0 ? s.node.free : `₹${num(o.cost)}`}</td>
                  <td className="py-3 pr-3">
                    <span className="font-display text-lg font-extrabold tabular">{num(o.mid, o.mid < 10 ? 1 : 0)}</span>
                    {o.hi > 0 && <span className="ml-2 text-xs text-ink-3">{f(s.node.range, { lo: num(o.lo, o.lo < 10 ? 1 : 0), hi: num(o.hi, o.hi < 10 ? 1 : 0) })}</span>}
                  </td>
                  <td className="py-3">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold">{s.opt[o.horizon]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BtnLink to="/proof" className="mt-4">{s.node.plan}</BtnLink>
      </Panel>
    </div>
  )
}
