import { Clock, Crosshair, LoaderCircle, MapPin, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { isPin, lookupPin, placeFromGps, PRESETS, recentPlaces, searchCity, withHindiName, type Place, type PresetKey } from '../lib/place'
import { ICON } from './atoms'
import { Sheet } from './Sheet'

function PlaceRow({ p, onPick }: { p: Place; onPick: (p: Place) => void }) {
  const { t, lang } = useI18n()
  return (
    <li>
      <button type="button" onClick={() => onPick(p)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-mist">
        <MapPin className="mt-0.5 size-5 shrink-0 text-muted" {...ICON} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{lang === 'hi' ? p.nameHi : p.name}</span>
          {(p.region || p.pin) && <span className="block text-sm text-muted">{[p.region, p.pin].filter(Boolean).join(' · ')}</span>}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${p.pilot ? 'bg-ink text-white' : 'bg-mist text-muted'}`}>
          {p.pilot ? t.picker.pilotCity : t.picker.weatherAir}
        </span>
      </button>
    </li>
  )
}

export function PlacePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setPlace } = useApp()
  const { t, lang } = useI18n()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState<'search' | 'gps' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const recent = open ? recentPlaces() : []

  useEffect(() => {
    if (!open) {
      setQ('')
      setResults(null)
      setErr(null)
    }
  }, [open])

  // search as you type (city names); PINs search when all 6 digits are in
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2 || (/^\d+$/.test(query) && !isPin(query))) {
      setResults(null)
      return
    }
    let off = false
    const id = setTimeout(async () => {
      setBusy('search')
      setErr(null)
      try {
        if (isPin(query)) {
          const p = await lookupPin(query)
          if (off) return
          setResults(p ? [p] : [])
          if (!p) setErr(t.picker.pinErr)
          // a full PIN that we know opens straight away
          else pickRef.current(p)
        } else {
          const r = await searchCity(query)
          if (off) return
          setResults(r)
          if (!r.length) setErr(t.picker.noResults)
        }
      } catch {
        if (!off) setErr(navigator.onLine ? t.picker.noResults : t.picker.netErr)
      } finally {
        if (!off) setBusy(null)
      }
    }, 350)
    return () => {
      off = true
      clearTimeout(id)
    }
  }, [q, t])

  const pick = async (p: Place) => {
    onClose()
    setPlace(p.source === 'search' ? await withHindiName(p).catch(() => p) : p)
  }
  const pickRef = useRef(pick)
  pickRef.current = pick
  const gps = async () => {
    setBusy('gps')
    setErr(null)
    try {
      const p = await placeFromGps()
      onClose()
      setPlace(p)
    } catch {
      setErr(t.picker.locErr)
    } finally {
      setBusy(null)
    }
  }

  const presetLabel = (k: PresetKey) => (k === 'leh' ? t.picker.lehDemo : lang === 'hi' ? PRESETS[k].nameHi : PRESETS[k].name)

  return (
    <Sheet open={open} onClose={onClose} title={t.picker.title}>
      <label className="relative block">
        <span className="sr-only">{t.picker.search}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" {...ICON} aria-hidden />
        <input
          className="field pl-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.picker.search}
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !results?.[0]) return
            // stop the Enter from also "clicking" the Change place button that gets focus back
            e.preventDefault()
            pick(results[0])
          }}
        />
      </label>

      <button type="button" className="btn btn-line mt-3 w-full" onClick={gps} disabled={busy === 'gps'}>
        {busy === 'gps' ? <LoaderCircle className="size-5 animate-spin" {...ICON} aria-hidden /> : <Crosshair className="size-5" {...ICON} aria-hidden />}
        {busy === 'gps' ? t.picker.locating : t.picker.useLoc}
      </button>

      <div aria-live="polite">
        {err && <p className="mt-3 rounded-lg bg-[#3b1520] px-3 py-2 text-sm text-[#fecdd3]">{err}</p>}
        {busy === 'search' && <p className="mt-3 text-sm text-muted">{t.picker.searching}</p>}
      </div>

      {results && results.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1 text-sm font-semibold text-muted">{t.picker.results}</h3>
          <ul>
            {results.map((p) => (
              <PlaceRow key={`${p.lat},${p.lon},${p.name}`} p={p} onPick={pick} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-muted">{t.picker.pilots}</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
            <button key={k} type="button" className="chip !py-1.5 !text-base" onClick={() => pick(PRESETS[k])}>
              <MapPin className="size-4" {...ICON} aria-hidden /> {presetLabel(k)}
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
            <Clock className="size-4" {...ICON} aria-hidden /> {t.picker.recent}
          </h3>
          <ul>
            {recent.map((p) => (
              <PlaceRow key={`${p.lat},${p.lon}`} p={p} onPick={pick} />
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  )
}
