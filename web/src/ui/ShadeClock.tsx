/**
 * Shade Clock: when the sun reaches the spot where someone sits, and where the nearest shade
 * is. Real building footprints with heights (Google Open Buildings) and tree pixels (ESA
 * WorldCover) around Gwalior exposure nodes; the geometry is in lib/shade.ts.
 * Also "Same place, both seasons": the coldest night and the hottest day at one gate.
 */
import { Snowflake, ThermometerSun } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp, useDay } from '../ctx'
import { useI18n } from '../i18n'
import { hourLabel, istToday, longDate } from '../lib/ist'
import { loadReplay, type Loaded } from '../lib/live'
import type { ExposureNode, NodesFile } from '../lib/nodes'
import { km, snapCityFor } from '../lib/place'
import { loadSummerDay } from '../lib/snapshot'
import { hasNight, nightPersonHours, type Point } from '../lib/points'
import { burningRisk, coldSpan, heatLevel, heatSpan, nightStats, type Level } from '../lib/risk'
import { bestMove, istTime, makeScene, shadeProfile, shadowsAt, sunWindow, type Scene } from '../lib/shade'
import { pointName, useHelp } from '../screens/shared'
import { DemoTag, LevelBadge, Skel, Src } from './atoms'

let nodesP: Promise<ExposureNode[]> | null = null
const loadNodes = () =>
  (nodesP ??= fetch('/data/gwalior/nodes.json')
    .then((r) => (r.ok ? (r.json() as Promise<NodesFile>) : { nodes: [] as ExposureNode[], meta: {} }))
    .then((f) => f.nodes)
    .catch(() => []))

/** The scene for a point: same id, or a node within 150 m. Gwalior only. */
export function useScene(p: Point | null | undefined): Scene | null {
  const { place } = useApp()
  const [nodes, setNodes] = useState<ExposureNode[] | null>(null)
  useEffect(() => {
    if (place.pilot !== 'gwalior') return
    let off = false
    loadNodes().then((n) => !off && setNodes(n))
    return () => {
      off = true
    }
  }, [place.pilot])
  return useMemo(() => {
    if (!p || !nodes || place.pilot !== 'gwalior') return null
    const node = nodes.find((n) => n.id === p.id) ?? nodes.find((n) => km(n.lat, n.lon, p.lat, p.lon) < 0.15)
    return node && node.buildings.length ? makeScene(node) : null
  }, [p, nodes, place.pilot])
}

const SHIFT: [number, number] = [8, 20]

function useClock(scene: Scene | null, date: string) {
  return useMemo(() => {
    if (!scene || !date) return null
    const fine = shadeProfile(scene, date, scene.spot, 6 * 60, 19 * 60, 5)
    const cells = shadeProfile(scene, date, scene.spot, 6 * 60, 19 * 60 - 30, 30)
    const inSun = sunWindow(fine, SHIFT)
    const move = bestMove(scene, date, 40, [12, 16])
    const at = shadeProfile(scene, date, move.at, 6 * 60, 19 * 60, 5)
    // when the better spot is shaded during the shift
    const shaded = sunWindow(at.map((s) => ({ ...s, shade: s.sunUp ? 1 - s.shade : 0 })), SHIFT)
    return { cells, inSun, move, shaded }
  }, [scene, date])
}

const DIR = (x: number, y: number) => Math.round(((Math.atan2(x, y) * 180) / Math.PI + 360) / 45) % 8

/** "11:45" -> "11:45 am" / Hindi hour label with minutes */
function timeLabel(min: number, lang: 'en' | 'hi') {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  if (!m) return hourLabel(h, lang)
  if (lang === 'hi') return hourLabel(h, lang).replace(' बजे', `:${String(m).padStart(2, '0')} बजे`)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

function SceneSvg({ scene, date, minutes, best }: { scene: Scene; date: string; minutes: number; best: [number, number] | null }) {
  const { t, f, lang } = useI18n()
  const sh = useMemo(() => shadowsAt(scene, istTime(date, minutes)), [scene, date, minutes])
  const H = 60 // metres from the spot to the edge
  const k = 150 / H
  const P = (x: number, y: number) => `${(150 + x * k).toFixed(1)},${(150 - y * k).toFixed(1)}`
  const poly = (pts: [number, number][]) => pts.map(([x, y]) => P(x, y)).join(' ')
  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[300px] rounded-lg border border-line bg-[#f4f1e8]" role="img" aria-label={f(t.shade.at, { time: timeLabel(minutes, lang) })}>
      <defs>
        <clipPath id="sc-clip">
          <rect width="300" height="300" />
        </clipPath>
      </defs>
      <g clipPath="url(#sc-clip)">
        {sh.buildings.map((b, i) => (
          <polygon key={`s${i}`} points={poly(b)} fill="#3d4a5c" fillOpacity={0.35} />
        ))}
        {sh.trees.map((tr, i) => (
          <circle key={`ts${i}`} cx={150 + tr.c[0] * k} cy={150 - tr.c[1] * k} r={tr.r * k} fill="#3d4a5c" fillOpacity={0.3} />
        ))}
        {scene.buildings.map((b, i) => (
          <polygon key={`b${i}`} points={poly(b.poly)} fill="#c9c2b2" stroke="#8d8676" strokeWidth={0.8} />
        ))}
        {scene.trees.map(([x, y], i) => (
          <circle key={`t${i}`} cx={150 + x * k} cy={150 - y * k} r={3 * k * 0.9} fill="#4c9a5b" fillOpacity={0.75} />
        ))}
        {best && (
          <>
            <line x1={150} y1={150} x2={150 + best[0] * k} y2={150 - best[1] * k} stroke="#1B2330" strokeDasharray="4 3" strokeWidth={1.5} />
            <circle cx={150 + best[0] * k} cy={150 - best[1] * k} r={7} fill="none" stroke="#157a45" strokeWidth={3} />
          </>
        )}
        <circle cx={150} cy={150} r={6} fill="#F07F13" stroke="#fff" strokeWidth={2} />
      </g>
      <text x={286} y={22} textAnchor="middle" fontSize="12" fontWeight="700" fill="#1B2330">
        N
      </text>
      <path d="M286 26 l-5 12 h10 z" fill="#1B2330" />
      <line x1={12} y1={288} x2={12 + 20 * k} y2={288} stroke="#1B2330" strokeWidth={2} />
      <text x={12} y={282} fontSize="10" fill="#1B2330">
        20 m
      </text>
    </svg>
  )
}

export function ShadeClockCard({ point }: { point: Point }) {
  const { t, f, lang } = useI18n()
  const { date } = useDay()
  const day = date || istToday()
  const scene = useScene(point)
  const clock = useClock(scene, day)
  const [sel, setSel] = useState<number | null>(null)
  if (!scene) return <p className="text-sm text-muted">{t.shade.none}</p>
  if (!clock) return <Skel className="h-40 w-full" />
  const { cells, inSun, move, shaded } = clock
  const minutes = sel ?? (inSun ? Math.round((inSun[0] + inSun[1]) / 60) * 30 : 13 * 60)
  const hasMove = move.gain > 0.5 && move.dist > 0
  const dir = t.shade.dirs[DIR(move.at[0], move.at[1])]
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {pointName(point, lang)} · {longDate(day, lang)} · {t.shade.sub}
      </p>
      <div>
        <ol className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
          {cells.map((c) => {
            const sun = c.sunUp && c.shade < 0.5
            return (
              <li key={c.minutes}>
                <button
                  type="button"
                  onClick={() => setSel(c.minutes)}
                  aria-pressed={minutes === c.minutes}
                  aria-label={`${timeLabel(c.minutes, lang)}: ${sun ? t.shade.sunLbl : t.shade.shadeLbl}`}
                  className={`block h-10 w-full rounded-[3px] ${minutes === c.minutes ? 'ring-2 ring-ink ring-offset-1' : ''}`}
                  style={{ background: !c.sunUp ? '#9aa6ae' : sun ? '#F7C600' : '#3d4a5c' }}
                />
              </li>
            )
          })}
        </ol>
        <div className="mt-1 grid text-[10px] text-muted tabular" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }} aria-hidden>
          {cells.map((c) => (
            <span key={c.minutes} className="text-center">
              {c.minutes % 120 === 0 ? String(c.minutes / 60).padStart(2, '0') : ''}
            </span>
          ))}
        </div>
        <p className="mt-1 flex gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-sm bg-[#F7C600]" aria-hidden /> {t.shade.sunLbl}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-sm bg-[#3d4a5c]" aria-hidden /> {t.shade.shadeLbl}
          </span>
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[300px_1fr]">
        <div>
          <SceneSvg scene={scene} date={day} minutes={minutes} best={hasMove ? move.at : null} />
          <p className="mt-1 text-xs text-muted">{f(t.shade.at, { time: timeLabel(minutes, lang) })}</p>
        </div>
        <div className="space-y-2">
          <p className="text-[17px] font-semibold">
            {inSun ? f(t.shade.inSun, { from: timeLabel(inSun[0], lang), to: timeLabel(inSun[1], lang) }) : t.shade.allShade}
          </p>
          {hasMove && shaded && (
            <p>
              <Src kind="estimated">
                {f(t.shade.near, { d: Math.round(move.dist), dir, from: timeLabel(shaded[0], lang), to: timeLabel(shaded[1], lang) })}
              </Src>{' '}
              <span className="text-sm text-muted">({f(t.shade.gain, { h: move.gain.toFixed(1) })})</span>
            </p>
          )}
          <h4 className="pt-2 text-sm font-semibold text-muted">{t.shade.options}</h4>
          <ul className="space-y-1.5 text-sm">
            {hasMove && (
              <li className="flex justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <b>{t.shade.move}</b> <span className="text-muted">{t.shade.moveWhen}</span>
              </li>
            )}
            <li className="flex justify-between gap-3 rounded-lg border border-line px-3 py-2">
              <b>{t.shade.canopy}</b> <span className="text-muted">{t.shade.canopyWhen}</span>
            </li>
            <li className="flex justify-between gap-3 rounded-lg border border-line px-3 py-2">
              <b>{t.shade.tree}</b> <span className="text-muted">{t.shade.treeWhen}</span>
            </li>
          </ul>
          <p className="text-xs text-muted">{t.shade.src}</p>
        </div>
      </div>
    </div>
  )
}

/** Shade Clock for the most urgent point that has building data (Shyam's gate when it is there). */
export function ShadeClockPanel({ points }: { points: Point[] }) {
  const { t } = useI18n()
  const { place } = useApp()
  const [nodes, setNodes] = useState<ExposureNode[] | null>(null)
  useEffect(() => {
    if (place.pilot !== 'gwalior') return
    let off = false
    loadNodes().then((n) => !off && setNodes(n))
    return () => {
      off = true
    }
  }, [place.pilot])
  const pick = useMemo(() => {
    if (!nodes) return null
    const has = (p: Point) => nodes.some((n) => n.buildings.length && (n.id === p.id || km(n.lat, n.lon, p.lat, p.lon) < 0.15))
    return points.find((p) => p.id === 'shyam-gate' && has(p)) ?? points.find(has) ?? null
  }, [nodes, points])
  if (!pick) return null
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="mb-2 font-display text-xl font-bold">{t.shade.title}</h2>
      <ShadeClockCard point={pick} />
    </section>
  )
}

// ---------- same place, both seasons ----------

function useReplay(kind: 'summer' | 'winter') {
  const { place } = useApp()
  const [r, setR] = useState<Loaded | null>(null)
  useEffect(() => {
    let off = false
    const snap = snapCityFor(place)
    loadReplay(kind, place.lat, place.lon)
      // offline: the hottest day saved in the app for the pilot cities
      .catch(() => (kind === 'summer' && snap ? loadSummerDay(snap) : null))
      .then((l) => !off && l && setR(l))
      .catch(() => {})
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, place.lat, place.lon])
  return r
}

export function BothSeasons() {
  const { t, f, lang } = useI18n()
  const { pts } = useApp()
  const help = useHelp()
  const winter = useReplay('winter')
  const summer = useReplay('summer')
  const gates = (pts.points ?? []).filter((p) => hasNight(p) && p.people.some((c) => c.group === 'guard'))
  const [pickId, setPick] = useState<string | null>(null)
  const p = gates.find((g) => g.id === pickId) ?? gates.find((g) => g.id === 'shyam-gate') ?? gates[0]
  const scene = useScene(p)
  const hot = summer?.data.days[0]
  const clock = useClock(scene, hot?.date ?? '')
  if (!p) return null
  const w0 = winter?.data.days[0]
  const w1 = winter?.data.days[1]
  const burn = w0 ? burningRisk(nightStats(w0, w1), { personHours: nightPersonHours(p), heater: p.heater ?? 'none', heaterRate: help.heaterRate }) : null
  const cold = w0 ? coldSpan(w0, w1, 2) : null
  const heatMax = hot ? (Math.max(0, ...hot.hours.map((h) => heatLevel(h.feels))) as Level) : null
  const heat = hot ? heatSpan(hot, 2) : null
  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold">{t.seasons.title}</h2>
          <p className="text-sm text-muted">{pointName(p, lang)}</p>
        </div>
        {gates.length > 1 && (
          <label className="text-sm">
            <span className="sr-only">{t.seasons.pick}</span>
            <select className="field !min-h-9 !py-1" value={p.id} onChange={(e) => setPick(e.target.value)}>
              {gates.map((g) => (
                <option key={g.id} value={g.id}>
                  {pointName(g, lang)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl p-4 text-white" style={{ background: '#2f5bb8' }}>
          <div className="flex items-center gap-2 font-bold">
            <Snowflake className="size-5" aria-hidden /> {w0 ? f(t.seasons.winter, { date: longDate(w0.date, lang) }) : '…'}
          </div>
          {w0 && burn ? (
            <div className="mt-2 space-y-1">
              <p className="num text-4xl font-bold">{f(t.seasons.feels, { t: Math.round(Math.min(w0.fmin, w1?.fmin ?? 99)) })}</p>
              <p className="font-semibold">{f(t.seasons.fire, { level: t.who.fireLevel[burn.level] })} · {burn.score}/100</p>
              {cold && <p className="text-sm">{f(t.cond.line.cold, { from: hourLabel(cold.from, lang), to: hourLabel(cold.to, lang) })}</p>}
            </div>
          ) : (
            <Skel className="mt-2 h-16 w-full opacity-40" />
          )}
        </div>
        <div className="rounded-xl p-4 text-white" style={{ background: '#b01f33' }}>
          <div className="flex items-center gap-2 font-bold">
            <ThermometerSun className="size-5" aria-hidden /> {hot ? f(t.seasons.summer, { date: longDate(hot.date, lang) }) : '…'}
          </div>
          {hot && heatMax != null ? (
            <div className="mt-2 space-y-1">
              <p className="num text-4xl font-bold">{f(t.seasons.feels, { t: Math.round(hot.fmax) })}</p>
              {heat && (
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <LevelBadge level={heatMax} size="sm" /> {hourLabel(heat.from, lang)} – {hourLabel(heat.to, lang)}
                </p>
              )}
              {clock?.inSun && <p className="text-sm">{f(t.seasons.sun, { from: timeLabel(clock.inSun[0], lang), to: timeLabel(clock.inSun[1], lang) })}</p>}
            </div>
          ) : (
            <Skel className="mt-2 h-16 w-full opacity-40" />
          )}
        </div>
      </div>
      <p className="mt-3 font-semibold">{t.seasons.line}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{t.src.replayShort}</span>
        <DemoTag label={t.src.estimated} />
      </div>
    </section>
  )
}

