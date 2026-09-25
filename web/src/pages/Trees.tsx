import { latLngToCell } from 'h3-js'
import { Camera, CheckCircle2, CircleHelp, Loader2, MapPin, Sprout, TreeDeciduous, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Btn, Panel, SectionTitle, TiltCard } from '../components/kit'
import { LocationPicker, type PickedLocation } from '../components/LocationPicker'
import { useI18n } from '../i18n'
import { analyseSpot, type SpotAnalysis } from '../lib/ai'
import { cellLabel } from '../lib/format'
import { H3_RES } from '../lib/match'
import { blurPeople, coarsen, type BlurResult } from '../lib/privacy'
import { byId, reasonKeys, type SpotAnswers } from '../lib/species'
import { store } from '../lib/store'
import type { SpeciesId } from '../lib/types'
import { useApp } from '../state'

type Tri = boolean | null

/** A small 3D-ish tree whose size and crown follow the species. */
function TreeGlyph({ id }: { id: SpeciesId }) {
  const sp = byId.get(id)!
  const h = 30 + (sp.maxH / 20) * 40
  const crown = sp.shade === 3 ? 34 : sp.shade === 2 ? 28 : 22
  const color = sp.openCrown ? '#9bd46a' : '#3f9b3a'
  return (
    <svg viewBox="0 0 100 100" className="size-20 drop-shadow-[0_6px_6px_rgb(var(--shade)/0.35)]" aria-hidden>
      <ellipse cx="50" cy="94" rx="26" ry="4" fill="rgb(0 0 0 / .15)" />
      <rect x="46" y={94 - h * 0.55} width="8" height={h * 0.55} rx="3" fill="#8a5a36" />
      <circle cx="50" cy={94 - h} r={crown} fill={color} />
      <circle cx={42} cy={94 - h - 6} r={crown * 0.55} fill="rgb(255 255 255 / .18)" />
      {id === 'amaltas' && [0, 1, 2, 3, 4].map((i) => <circle key={i} cx={36 + i * 7} cy={94 - h + 14 + (i % 2) * 5} r="3" fill="#ffd23f" />)}
      {id === 'kachnar' && [0, 1, 2].map((i) => <circle key={i} cx={40 + i * 10} cy={94 - h + 6} r="3" fill="#f3a3d0" />)}
    </svg>
  )
}

function Choice<T extends string | boolean | null>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-2xl border-2 px-2 py-2.5 text-sm font-bold transition-all ${
            value === v ? 'border-accent bg-accent-soft shadow-[0_4px_0_var(--accent-edge)]' : 'border-line bg-surface shadow-[0_4px_0_var(--line)]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default function Trees() {
  const { city, spots } = useApp()
  const { s, f, lang, num } = useI18n()
  const [loc, setLoc] = useState<PickedLocation | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [blurred, setBlurred] = useState<BlurResult | null>(null)
  const [blurring, setBlurring] = useState(false)
  const [wires, setWires] = useState<Tri>(null)
  const [space, setSpace] = useState<SpotAnswers['space']>('medium')
  const [paved, setPaved] = useState(false)
  const [water, setWater] = useState<Tri>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<(SpotAnalysis & { answers: SpotAnswers }) | null>(null)
  const [saved, setSaved] = useState(false)

  const cell = useMemo(() => {
    if (!city || !loc) return null
    const h = latLngToCell(loc.lat, loc.lon, H3_RES)
    return city.cells.find((c) => c.h3 === h) ?? null
  }, [city, loc])
  const crowded = !!cell && !!city && cell.pop > city.norms.popP95 * 0.6

  const onPhoto = async (file: File | null) => {
    setPhoto(file)
    setBlurred(null)
    if (!file) return
    setBlurring(true)
    try {
      setBlurred(await blurPeople(file))
    } finally {
      setBlurring(false)
    }
  }

  const check = async () => {
    setBusy(true)
    setSaved(false)
    const answers: SpotAnswers = { wires, space, paved, water, crowded }
    const r = await analyseSpot({ imageDataUrl: blurred?.dataUrl, answers })
    setResult({ ...r, answers: { ...answers, wires: r.wiresSeen ? true : wires } })
    setBusy(false)
  }

  const save = async () => {
    if (!result || !loc) return
    const lat = coarsen(loc.lat)
    const lon = coarsen(loc.lon)
    await store.add('spots', {
      lat, lon, h3: latLngToCell(lat, lon, H3_RES), verdict: result.verdict, species: result.species,
      wires: result.answers.wires, space: result.answers.space, paved: result.answers.paved, water: result.answers.water,
      thumb: blurred?.dataUrl, why: result.whyEn || undefined, whyHi: result.whyHi || undefined, createdAt: Date.now(), ai: result.ai,
    })
    setSaved(true)
  }

  const reset = () => {
    setResult(null)
    setPhoto(null)
    setBlurred(null)
    setSaved(false)
  }

  const verdictUi = result && {
    yes: { Icon: CheckCircle2, text: s.trees.verdictYes, cls: 'bg-good text-white', edge: '#0b7a3b' },
    maybe: { Icon: CircleHelp, text: s.trees.verdictMaybe, cls: 'bg-warning text-[#2b1608]', edge: '#b37400' },
    no: { Icon: XCircle, text: s.trees.verdictNo, cls: 'bg-critical text-white', edge: '#9b2226' },
  }[result.verdict]

  return (
    <div className="space-y-6">
      <SectionTitle sub={s.trees.intro}>{s.trees.title}</SectionTitle>

      {!result ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel className="space-y-4">
            <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
              <MapPin className="size-5 text-accent" aria-hidden /> {s.report.where}
            </h2>
            <LocationPicker value={loc} onChange={setLoc} />
            {cell && (
              <p className="text-sm text-ink-2">
                {cell.lst != null && f(s.trees.reasons.hot, { t: Math.round(cell.lst) })} {f(s.trees.reasons.people, { n: cell.exposed })}
              </p>
            )}
            <h2 className="flex items-center gap-2 pt-2 font-display text-xl font-extrabold">
              <Camera className="size-5 text-accent" aria-hidden /> {s.trees.photo}
            </h2>
            <p className="text-sm text-ink-2">{s.trees.photoTip}</p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line bg-surface-2 px-4 py-8 font-display font-bold text-ink-2 hover:border-accent hover:text-accent">
              <Camera className="size-9" aria-hidden />
              {photo ? s.report.changePhoto : s.report.takePhoto}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
            </label>
            {blurring && <p className="flex items-center gap-2 text-sm text-ink-2"><Loader2 className="size-4 animate-spin" /> {s.report.blurring}</p>}
            {blurred && <img src={blurred.dataUrl} alt="" className="w-full rounded-2xl border border-line" />}
          </Panel>

          <Panel className="space-y-5">
            <div>
              <div className="mb-2 font-display font-extrabold">{s.trees.wires}</div>
              <Choice value={wires} onChange={setWires} options={[[true, s.trees.yes], [false, s.trees.no], [null, s.trees.unsure]]} />
            </div>
            <div>
              <div className="mb-2 font-display font-extrabold">{s.trees.space}</div>
              <Choice value={space} onChange={setSpace} options={[['narrow', s.trees.spaceNarrow], ['medium', s.trees.spaceMedium], ['wide', s.trees.spaceWide]]} />
            </div>
            <div>
              <div className="mb-2 font-display font-extrabold">{s.trees.ground}</div>
              <Choice value={paved} onChange={setPaved} options={[[false, s.trees.groundSoil], [true, s.trees.groundPaved]]} />
            </div>
            <div>
              <div className="mb-2 font-display font-extrabold">{s.trees.water}</div>
              <Choice value={water} onChange={setWater} options={[[true, s.trees.yes], [false, s.trees.no], [null, s.trees.unsure]]} />
            </div>
            <Btn size="lg" className="w-full" disabled={!loc || busy || blurring} onClick={check}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Sprout className="size-5" />} {busy ? s.trees.checking : s.trees.check}
            </Btn>
          </Panel>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            <Panel className="space-y-4">
              {verdictUi && (
                <div className={`anim-pop flex items-center gap-3 rounded-3xl px-5 py-4 font-display text-2xl font-extrabold ${verdictUi.cls}`}
                  style={{ boxShadow: `0 6px 0 ${verdictUi.edge}` }}>
                  <verdictUi.Icon className="size-8 shrink-0" aria-hidden /> {verdictUi.text}
                </div>
              )}
              {loc && <p className="flex items-center gap-1.5 text-sm text-ink-2"><MapPin className="size-4" aria-hidden /> {cell ? cellLabel(cell, s, lang) : loc.label}</p>}
              <div>
                <div className="mb-2 font-display text-lg font-extrabold">{s.trees.why}</div>
                <ul className="space-y-2 text-sm">
                  {(lang === 'hi' ? result.whyHi : result.whyEn) && (
                    <li className="rounded-2xl bg-accent-soft px-4 py-2.5 font-semibold">{lang === 'hi' ? result.whyHi : result.whyEn}</li>
                  )}
                  {reasonKeys(result.answers).map((k) => (
                    <li key={k} className="rounded-2xl bg-surface-2 px-4 py-2.5">{s.trees.reasons[k]}</li>
                  ))}
                  {cell?.lst != null && <li className="rounded-2xl bg-surface-2 px-4 py-2.5">{f(s.trees.reasons.hot, { t: Math.round(cell.lst) })}</li>}
                </ul>
              </div>
              {blurred && <img src={blurred.dataUrl} alt="" className="w-full rounded-2xl border border-line" />}
            </Panel>

            <div className="space-y-4">
              {result.species.length > 0 && (
                <>
                  <h2 className="font-display text-2xl font-extrabold">{s.trees.best}</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {result.species.map((id, i) => {
                      const sp = byId.get(id)!
                      return (
                        <TiltCard key={id} className="surface-3d p-4 text-center">
                          <div className="pop mx-auto w-fit"><TreeGlyph id={id} /></div>
                          <div className="pop font-display text-xl font-extrabold">
                            {i === 0 && <span className="mr-1 text-accent">★</span>}
                            {s.species[id].name}
                          </div>
                          <p className="pop mt-1 text-xs text-ink-2">{s.species[id].note}</p>
                          <div className="pop mt-2 flex flex-wrap justify-center gap-1 text-[11px] font-semibold">
                            <span className="rounded-full bg-surface-2 px-2 py-0.5">{f(s.trees.height, { h: sp.maxH })}</span>
                            <span className="rounded-full bg-surface-2 px-2 py-0.5">{f(s.trees.waterNeed, { w: sp.water === 'low' ? s.trees.low : s.trees.medium })}</span>
                            <span className="rounded-full bg-surface-2 px-2 py-0.5">
                              {f(s.trees.shadeLbl, { s: sp.shade === 3 ? s.trees.dense : sp.shade === 2 ? s.trees.medium : s.trees.light })}
                            </span>
                          </div>
                        </TiltCard>
                      )
                    })}
                  </div>
                  {result.answers.crowded && <p className="rounded-2xl bg-cool-soft px-4 py-3 text-sm">{s.trees.humidNote}</p>}
                </>
              )}
              <div className="flex flex-wrap gap-3">
                {result.verdict !== 'no' && (
                  <Btn size="lg" onClick={save} disabled={saved}>
                    <TreeDeciduous className="size-5" /> {s.trees.save}
                  </Btn>
                )}
                <Btn size="lg" variant="soft" onClick={reset}>{s.trees.another}</Btn>
              </div>
              {saved && <p className="font-semibold text-good">{s.trees.saved}</p>}
            </div>
          </div>
        </div>
      )}

      {spots.length > 0 && (
        <Panel>
          <h2 className="mb-3 font-display text-xl font-extrabold">{f(s.trees.list, { n: num(spots.length) })}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...spots].sort((a, b) => b.createdAt - a.createdAt).slice(0, 12).map((sp) => {
              const c = city?.cells.find((x) => x.h3 === sp.h3)
              return (
                <li key={sp.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
                  <Sprout className={`size-5 shrink-0 ${sp.verdict === 'yes' ? 'text-good' : 'text-warning'}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{c ? cellLabel(c, s, lang) : `${sp.lat}, ${sp.lon}`}</span>
                    <span className="text-xs text-ink-2">{sp.species.map((id) => s.species[id].name).join(', ') || '—'}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}
