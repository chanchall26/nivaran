import { latLngToCell } from 'h3-js'
import {
  ArrowLeft, ArrowRight, Camera, Check, Crosshair, EyeOff, Flame, HelpCircle, Loader2, MapPin, ShieldCheck, Sparkles, Sun, Tent,
  Trash2, Trees, Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Btn, BtnLink, Panel } from '../components/kit'
import { useI18n } from '../i18n'
import { aiMode, analyseReport, type ReportAnalysis } from '../lib/ai'
import { cellLabel } from '../lib/format'
import { H3_RES } from '../lib/match'
import { ROUTE_INFO, SEASON_CATEGORIES } from '../lib/policy'
import { blurPeople, coarsen, type BlurResult } from '../lib/privacy'
import { store } from '../lib/store'
import type { ReportCategory } from '../lib/types'
import { useApp } from '../state'

const CAT_ICON: Record<ReportCategory, typeof Flame> = {
  guard_fire: Flame, homeless: Users, labour_camp: Tent, waste_only: Trash2, heat_exposed: Sun, no_shade_spot: Trees, other: HelpCircle,
}

export default function Report() {
  const { city, season } = useApp()
  const { s, f, lang } = useI18n()
  const [params] = useSearchParams()
  const presetCell = params.get('h3')

  const [step, setStep] = useState(0)
  const [loc, setLoc] = useState<{ lat: number; lon: number; label: string } | null>(null)
  const [locError, setLocError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [blurAll, setBlurAll] = useState(false)
  const [blurred, setBlurred] = useState<BlurResult | null>(null)
  const [blurring, setBlurring] = useState(false)
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [people, setPeople] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ReportAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  const areas = useMemo(() => {
    if (!city) return []
    const seen = new Map<string, { lat: number; lon: number; label: string }>()
    for (const c of city.cells) {
      if (c.area && c.areaKm < 1.2 && !seen.has(c.area)) seen.set(c.area, { lat: c.lat, lon: c.lon, label: lang === 'hi' && c.areaHi ? c.areaHi : c.area })
    }
    return [...seen.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label))
  }, [city, lang])

  const effectiveLoc = useMemo(() => {
    if (loc) return loc
    if (presetCell && city) {
      const c = city.cells.find((x) => x.h3 === presetCell)
      if (c) return { lat: c.lat, lon: c.lon, label: cellLabel(c, s, lang) }
    }
    return null
  }, [loc, presetCell, city, s, lang])

  const locate = () => {
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'GPS' })
        setLocating(false)
      },
      (e) => {
        setLocError(f(s.report.gpsError, { e: e.message }))
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const onPhoto = async (file: File | null, all = blurAll) => {
    setPhoto(file)
    setBlurred(null)
    if (!file) return
    setBlurring(true)
    try {
      setBlurred(await blurPeople(file, { blurAll: all }))
    } finally {
      setBlurring(false)
    }
  }

  const insideCity =
    effectiveLoc && city ? city.cells.some((c) => c.h3 === latLngToCell(effectiveLoc.lat, effectiveLoc.lon, H3_RES)) : false
  const canNext = [!!effectiveLoc, !blurring, !!category && people !== null]

  const submit = async () => {
    if (!effectiveLoc || !category || people === null) return
    setSubmitting(true)
    setError(null)
    try {
      const a = await analyseReport({ imageDataUrl: blurred?.dataUrl, season, userCategory: category, userPeoplePresent: people, note })
      const lat = coarsen(effectiveLoc.lat)
      const lon = coarsen(effectiveLoc.lon)
      await store.add('reports', {
        season, category: a.category, route: a.route, lat, lon, h3: latLngToCell(lat, lon, H3_RES),
        thumb: blurred?.dataUrl, facesBlurred: (blurred?.faces ?? 0) + (blurred?.people ?? 0), peoplePresent: a.peoplePresent,
        summary: a.summary, summaryHi: a.summaryHi, note: note || undefined, status: 'open', createdAt: Date.now(), ai: a.ai,
      })
      setResult(a)
    } catch (e) {
      setError(f(s.report.saveError, { e: e instanceof Error ? e.message : String(e) }))
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setResult(null)
    setStep(0)
    setPhoto(null)
    setBlurred(null)
    setCategory(null)
    setPeople(null)
    setNote('')
  }

  // ---- done ------------------------------------------------------------------------------
  if (result) {
    const who = s.route[ROUTE_INFO[result.route].who as keyof typeof s.route]
    const summary = lang === 'hi' ? result.summaryHi || result.summary : result.summary
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <Panel className="text-center">
          <div className="anim-pop mx-auto flex size-20 items-center justify-center rounded-full bg-good text-white shadow-[0_6px_0_#0b7a3b,0_16px_30px_-8px_#12a150]">
            <Check className="size-10" strokeWidth={3} aria-hidden />
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold">{s.report.doneTitle}</h1>
          {summary && <p className="mt-2 text-lg text-ink-2">{summary}</p>}
          <dl className="mt-6 space-y-3 text-left">
            {[
              [s.report.understood, s.cat[result.category]],
              [s.report.route, s.route[result.route]],
              [s.report.to, who],
              ...(result.plantable ? [[s.report.plantable, result.plantable]] : []),
              [s.report.ai, result.ai === 'gemini' ? f(s.report.aiGemini, { c: result.confidence }) : s.report.aiRules],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-surface-2 px-4 py-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-ink-3">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-good/15 px-4 py-3 font-bold text-good">
            <ShieldCheck className="size-5" aria-hidden /> {s.report.noFine}
          </p>
        </Panel>
        <div className="grid grid-cols-2 gap-3">
          <BtnLink to="/map" size="lg">{s.report.seeMap}</BtnLink>
          <Btn size="lg" variant="soft" onClick={reset}>{s.report.another}</Btn>
        </div>
      </div>
    )
  }

  // ---- wizard ------------------------------------------------------------------------------
  const titles = [s.report.where, s.report.photo, s.report.what]
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="font-display text-4xl font-extrabold">{s.report.title}</h1>
        <p className="mt-2 text-lg text-ink-2">{season === 'sardi' ? s.report.introSardi : s.report.introGarmi}</p>
      </div>

      {/* progress */}
      <div>
        <div className="mb-2 flex justify-between text-sm font-bold">
          <span className="text-accent">{f(s.report.step, { n: step + 1 })}</span>
          <span className="text-ink-2">{titles[step]}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {titles.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => i <= step && setStep(i)}
              aria-label={t}
              className={`h-2.5 rounded-full transition-colors ${i <= step ? 'bg-accent' : 'bg-line'}`}
            />
          ))}
        </div>
      </div>

      <Panel className="anim-rise" key={step}>
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <MapPin className="size-6 text-accent" aria-hidden /> {s.report.where}
            </h2>
            <Btn size="lg" className="w-full" onClick={locate} disabled={locating}>
              {locating ? <Loader2 className="size-5 animate-spin" /> : <Crosshair className="size-5" />} {s.report.myLocation}
            </Btn>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-ink-2">{s.report.pickArea}</span>
              <select
                className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 text-base font-semibold"
                value=""
                onChange={(e) => {
                  const a = areas.find(([n]) => n === e.target.value)
                  if (a) setLoc({ lat: a[1].lat, lon: a[1].lon, label: a[1].label })
                }}
              >
                <option value="">…</option>
                {areas.map(([n, a]) => (
                  <option key={n} value={n}>{a.label}</option>
                ))}
              </select>
            </label>
            {effectiveLoc && (
              <div className="anim-rise flex items-start gap-3 rounded-2xl bg-accent-soft px-4 py-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                <div>
                  <b>{effectiveLoc.label}</b>
                  <p className="text-xs text-ink-2">{s.report.publicPrecision}</p>
                  {!insideCity && <p className="text-sm font-semibold text-critical">{s.report.outside}</p>}
                </div>
              </div>
            )}
            {locError && <p className="text-sm text-critical">{locError}</p>}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Camera className="size-6 text-accent" aria-hidden /> {s.report.photo}
            </h2>
            <p className="flex gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
              <EyeOff className="mt-0.5 size-5 shrink-0" aria-hidden /> {s.report.photoTip}
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line bg-surface-2 px-4 py-10 text-center font-display text-lg font-bold text-ink-2 transition-colors hover:border-accent hover:text-accent">
              <Camera className="size-10" aria-hidden />
              {photo ? s.report.changePhoto : s.report.takePhoto}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
            </label>
            {blurring && (
              <p className="flex items-center gap-2 text-sm text-ink-2">
                <Loader2 className="size-4 animate-spin" /> {s.report.blurring}
              </p>
            )}
            {blurred && (
              <div className="anim-rise space-y-3">
                <img src={blurred.dataUrl} alt="" className="w-full rounded-2xl border border-line shadow-[var(--shadow-3d)]" />
                <p className="text-sm text-ink-2">
                  {blurAll ? s.report.blurredAll : f(s.report.blurred, { f: blurred.faces, p: blurred.people })}
                </p>
                <label className="flex items-center gap-2.5 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--accent)]"
                    checked={blurAll}
                    onChange={(e) => {
                      setBlurAll(e.target.checked)
                      onPhoto(photo, e.target.checked)
                    }}
                  />
                  {s.report.blurAll}
                </label>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-display text-2xl font-extrabold">{s.report.what}</h2>
            <div className="grid gap-2.5">
              {SEASON_CATEGORIES[season].map((c) => {
                const Icon = CAT_ICON[c]
                const on = category === c
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCategory(c)}
                    className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left font-semibold transition-all ${
                      on ? 'border-accent bg-accent-soft shadow-[0_4px_0_var(--accent-edge)]' : 'border-line bg-surface shadow-[0_4px_0_var(--line)]'
                    }`}
                  >
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2'}`}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    {s.cat[c]}
                  </button>
                )
              })}
            </div>
            <fieldset>
              <legend className="mb-2 font-display text-lg font-extrabold">{s.report.people}</legend>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  [true, s.report.peopleYes],
                  [false, s.report.peopleNo],
                ] as const).map(([v, label]) => (
                  <button
                    key={String(v)}
                    type="button"
                    aria-pressed={people === v}
                    onClick={() => setPeople(v)}
                    className={`rounded-2xl border-2 px-3 py-3.5 font-bold transition-all ${
                      people === v ? 'border-ink bg-ink text-bg shadow-[0_4px_0_rgb(0_0_0/0.35)]' : 'border-line bg-surface shadow-[0_4px_0_var(--line)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={s.report.note}
              rows={2}
              className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3"
            />
          </div>
        )}
      </Panel>

      {error && <p className="text-sm font-semibold text-critical">{error}</p>}

      <div className="flex gap-3">
        {step > 0 && (
          <Btn variant="soft" size="lg" onClick={() => setStep(step - 1)} aria-label={s.app.back}>
            <ArrowLeft className="size-5" />
          </Btn>
        )}
        {step < 2 ? (
          <Btn size="lg" className="flex-1" disabled={!canNext[step]} onClick={() => setStep(step + 1)}>
            {s.app.next} <ArrowRight className="size-5" />
          </Btn>
        ) : (
          <Btn size="lg" className="flex-1" disabled={!canNext[2] || submitting} onClick={submit}>
            {submitting ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            {submitting ? s.report.sending : s.report.send}
          </Btn>
        )}
      </div>
      <p className="text-center text-xs text-ink-3">
        {f(s.report.aiLine, { m: aiMode() })} · <Link to="/method" className="underline">{s.nav.how}</Link>
      </p>
    </div>
  )
}
