import { latLngToCell } from 'h3-js'
import { Camera, CheckCircle2, Crosshair, EyeOff, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../components/ui'
import { aiMode, analyseReport, type ReportAnalysis } from '../lib/ai'
import { H3_RES } from '../lib/match'
import { CATEGORY_LABEL, ROUTE_INFO, SEASON_CATEGORIES } from '../lib/policy'
import { blurPeople, coarsen, type BlurResult } from '../lib/privacy'
import { store } from '../lib/store'
import type { ReportCategory } from '../lib/types'
import { useApp } from '../state'

export default function Report() {
  const { city, season } = useApp()
  const [params] = useSearchParams()
  const presetCell = params.get('h3')

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
    const seen = new Map<string, { lat: number; lon: number }>()
    for (const c of city.cells) if (c.area && !seen.has(c.area)) seen.set(c.area, { lat: c.lat, lon: c.lon })
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [city])

  const effectiveLoc = useMemo(() => {
    if (loc) return loc
    if (presetCell && city) {
      const c = city.cells.find((x) => x.h3 === presetCell)
      if (c) return { lat: c.lat, lon: c.lon, label: c.area ? `${c.area} ke paas (map se)` : 'Map se chuna' }
    }
    return null
  }, [loc, presetCell, city])

  const locate = () => {
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'Aapki location (GPS)' })
        setLocating(false)
      },
      (e) => {
        setLocError(`GPS nahi mila (${e.message}). Neeche se ilaaka chuniye.`)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const onPhoto = async (f: File | null, all = blurAll) => {
    setPhoto(f)
    setBlurred(null)
    if (!f) return
    setBlurring(true)
    try {
      setBlurred(await blurPeople(f, { blurAll: all }))
    } finally {
      setBlurring(false)
    }
  }

  const insideCity = effectiveLoc && city ? city.cells.some((c) => c.h3 === latLngToCell(effectiveLoc.lat, effectiveLoc.lon, H3_RES)) : false
  const canSubmit = effectiveLoc && category && people !== null && !submitting && !blurring

  const submit = async () => {
    if (!effectiveLoc || !category || people === null) return
    setSubmitting(true)
    setError(null)
    try {
      const analysis = await analyseReport({
        imageDataUrl: blurred?.dataUrl,
        season,
        userCategory: category,
        userPeoplePresent: people,
        note,
      })
      const lat = coarsen(effectiveLoc.lat)
      const lon = coarsen(effectiveLoc.lon)
      await store.add('reports', {
        season,
        category: analysis.category,
        route: analysis.route,
        lat,
        lon,
        h3: latLngToCell(lat, lon, H3_RES),
        thumb: blurred?.dataUrl,
        facesBlurred: (blurred?.faces ?? 0) + (blurred?.people ?? 0),
        peoplePresent: analysis.peoplePresent,
        summary: analysis.summary,
        note: note || undefined,
        status: 'open',
        createdAt: Date.now(),
        ai: analysis.ai,
      })
      setResult(analysis)
    } catch (e) {
      setError(`Report save nahi hui: ${e instanceof Error ? e.message : e}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    const route = ROUTE_INFO[result.route]
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-8 shrink-0 text-good" aria-hidden />
            <div>
              <h1 className="text-xl font-bold">Shukriya! Report darj ho gayi.</h1>
              <p className="mt-1 text-ink-2">{result.summary}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-3">Samajh</dt>
            <dd>{CATEGORY_LABEL[result.category]}</dd>
            <dt className="text-ink-3">Madad ka raasta</dt>
            <dd className="font-semibold">{route.label}</dd>
            <dt className="text-ink-3">Kisko gaya</dt>
            <dd>{route.who}</dd>
            {result.plantable && (
              <>
                <dt className="text-ink-3">Ped lag sakta hai?</dt>
                <dd>{result.plantable}</dd>
              </>
            )}
            <dt className="text-ink-3">AI</dt>
            <dd>
              {result.ai === 'gemini' ? `Gemini · confidence ${result.confidence}` : 'Rules (Gemini off)'}
              {result.error && <span className="block text-xs text-critical">Gemini error, rules use hue</span>}
            </dd>
          </dl>
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-good/10 px-3 py-2 text-sm">
            <ShieldCheck className="size-4 text-good" aria-hidden />
            Kisi insaan pe challan ya karwai nahi hogi. Sirf madad.
          </p>
        </Card>
        <div className="flex gap-2">
          <Link to="/map" className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-center font-semibold text-white">
            Map pe dekho
          </Link>
          <button
            type="button"
            className="flex-1 rounded-lg border border-line bg-white px-4 py-2.5 font-semibold"
            onClick={() => {
              setResult(null)
              setPhoto(null)
              setBlurred(null)
              setCategory(null)
              setPeople(null)
              setNote('')
            }}
          >
            Ek aur report
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Madad, Challan Nahi</h1>
        <p className="mt-1 text-ink-2">
          {season === 'sardi'
            ? 'Kisi ko thand mein aag jalate ya bina garmahat ke dekha? Batao, hum madad bhejenge.'
            : 'Koi dhoop mein bina chhaaya ya paani ke kaam kar raha hai? Ya koi jagah jahan ped/chhaaya chahiye? Batao.'}
        </p>
      </div>

      <Card title="1. Jagah">
        <div className="space-y-2">
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-paper px-4 py-2.5 font-semibold"
          >
            {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
            Meri location lo
          </button>
          <select
            className="w-full rounded-lg border border-line bg-white px-3 py-2"
            value=""
            onChange={(e) => {
              const a = areas.find(([n]) => n === e.target.value)
              if (a) setLoc({ ...a[1], label: `${a[0]} ke paas` })
            }}
          >
            <option value="">…ya ilaaka chuniye</option>
            {areas.map(([n]) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {effectiveLoc && (
            <p className="text-sm">
              <b>{effectiveLoc.label}</b>{' '}
              <span className="text-ink-3">
                · public map pe sirf ~100 m tak ({coarsen(effectiveLoc.lat)}, {coarsen(effectiveLoc.lon)})
              </span>
              {!insideCity && <span className="block text-critical">Ye jagah Gwalior city limits ke bahar lag rahi hai.</span>}
            </p>
          )}
          {locError && <p className="text-sm text-critical">{locError}</p>}
        </div>
      </Card>

      <Card title="2. Photo (optional)">
        <p className="mb-3 flex gap-2 rounded-lg bg-paper px-3 py-2 text-sm text-ink-2">
          <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          Jagah ya aag ki photo lein, logon ki nahi. Chehre aapke phone pe hi blur hote hain; asli photo kahin nahi jaati.
        </p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-6 font-semibold text-ink-2 hover:border-ink-3">
          <Camera className="size-5" aria-hidden />
          {photo ? 'Doosri photo lo' : 'Photo lo / chuno'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {blurring && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
            <Loader2 className="size-4 animate-spin" /> Chehre dhoondh ke blur kar rahe hain (phone pe hi)…
          </p>
        )}
        {blurred && (
          <div className="mt-3 space-y-2">
            <img src={blurred.dataUrl} alt="Blur ki hui photo" className="w-full rounded-lg border border-line" />
            <p className="text-sm text-ink-2">
              {blurAll ? 'Poori photo blur ki gayi.' : `${blurred.faces} chehre aur ${blurred.people} logon ka upar ka hissa blur kiya.`}{' '}
              Sirf yahi blur photo bheji jaayegi.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={blurAll}
                onChange={(e) => {
                  setBlurAll(e.target.checked)
                  onPhoto(photo, e.target.checked)
                }}
              />
              Poori photo blur karo (aur zyada privacy)
            </label>
          </div>
        )}
      </Card>

      <Card title="3. Kya dekha?">
        <div className="flex flex-wrap gap-2">
          {SEASON_CATEGORIES[season].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${
                category === c ? 'border-[var(--accent-600)] bg-[var(--accent-50)] font-semibold' : 'border-line'
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Wahan log hain?</legend>
          <div className="mt-1 flex gap-2">
            {[
              [true, 'Haan, log hain'],
              [false, 'Nahi, koi nahi'],
            ].map(([v, l]) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={people === v}
                onClick={() => setPeople(v as boolean)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  people === v ? 'border-ink bg-ink text-white' : 'border-line'
                }`}
              >
                {l as string}
              </button>
            ))}
          </div>
        </fieldset>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Kuch aur batana hai? (optional) jaise: 'gate no. 2, raat 11 baje ke baad'"
          rows={2}
          className="mt-4 w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
      </Card>

      {error && <p className="text-sm text-critical">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-600)] px-4 py-3 text-lg font-bold text-white disabled:opacity-40"
      >
        {submitting ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
        {submitting ? 'Samajh rahe hain…' : 'Report bhejo'}
      </button>
      <p className="text-center text-xs text-ink-3">AI: {aiMode()}</p>
    </div>
  )
}
