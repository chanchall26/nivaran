import { Crosshair, Loader2, MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { useApp } from '../state'
import { Btn } from './kit'

export interface PickedLocation {
  lat: number
  lon: number
  label: string
  /** English area name, for records */
  area: string
}

/** GPS or a named locality. Shared by the tree finder and the colony pledge. */
export function LocationPicker({ value, onChange }: { value: PickedLocation | null; onChange: (l: PickedLocation) => void }) {
  const { city } = useApp()
  const { s, f, lang } = useI18n()
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const areas = useMemo(() => {
    if (!city) return []
    const seen = new Map<string, PickedLocation>()
    for (const c of city.cells) {
      if (c.area && c.areaKm < 1.2 && !seen.has(c.area))
        seen.set(c.area, { lat: c.lat, lon: c.lon, area: c.area, label: lang === 'hi' && c.areaHi ? c.areaHi : c.area })
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [city, lang])

  const locate = () => {
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'GPS', area: 'GPS' })
        setLocating(false)
      },
      (e) => {
        setError(f(s.report.gpsError, { e: e.message }))
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-3">
      <Btn className="w-full" onClick={locate} disabled={locating}>
        {locating ? <Loader2 className="size-5 animate-spin" /> : <Crosshair className="size-5" />} {s.report.myLocation}
      </Btn>
      <select
        className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 font-semibold"
        value=""
        aria-label={s.report.pickArea}
        onChange={(e) => {
          const a = areas.find((x) => x.area === e.target.value)
          if (a) onChange(a)
        }}
      >
        <option value="">{s.report.pickArea}…</option>
        {areas.map((a) => (
          <option key={a.area} value={a.area}>{a.label}</option>
        ))}
      </select>
      {value && (
        <p className="flex items-center gap-2 rounded-2xl bg-accent-soft px-4 py-2.5 font-semibold">
          <MapPin className="size-4 text-accent" aria-hidden /> {value.label}
        </p>
      )}
      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  )
}
