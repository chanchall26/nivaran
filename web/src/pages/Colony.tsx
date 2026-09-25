import { Check, Download, Loader2, Trophy } from 'lucide-react'
import { useRef, useState } from 'react'
import { Btn, Panel, SectionTitle, TiltCard } from '../components/kit'
import { LocationPicker, type PickedLocation } from '../components/LocationPicker'
import { useI18n } from '../i18n'
import { store } from '../lib/store'
import type { Colony as ColonyDoc } from '../lib/types'
import { useApp } from '../state'

/** The badge: a 3D medal, sun on the left, moon on the right, the colony's name across. */
export function Badge({ name, size = 220, svgRef }: { name: string; size?: number; svgRef?: React.Ref<SVGSVGElement> }) {
  const { s } = useI18n()
  const short = name.length > 22 ? name.slice(0, 21) + '…' : name
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 240 240" role="img" aria-label={`${s.colony.badgeTop} ${name}`}>
      <defs>
        <radialGradient id="b-sun" cx="30%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff3b8" /><stop offset=".5" stopColor="#ffb52e" /><stop offset="1" stopColor="#e2571e" />
        </radialGradient>
        <radialGradient id="b-moon" cx="70%" cy="30%" r="80%">
          <stop offset="0" stopColor="#dbe7ff" /><stop offset=".5" stopColor="#4f79d0" /><stop offset="1" stopColor="#1b2f73" />
        </radialGradient>
        <linearGradient id="b-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbe7a1" /><stop offset=".5" stopColor="#d4a017" /><stop offset="1" stopColor="#8a6508" />
        </linearGradient>
        <clipPath id="b-l"><rect x="0" y="0" width="120" height="240" /></clipPath>
        <clipPath id="b-r"><rect x="120" y="0" width="120" height="240" /></clipPath>
        <path id="b-top" d="M 38 120 A 82 82 0 0 1 202 120" />
        <path id="b-bot" d="M 30 120 A 90 90 0 0 0 210 120" />
      </defs>
      <circle cx="120" cy="126" r="108" fill="rgb(0 0 0 / .25)" />
      <circle cx="120" cy="120" r="108" fill="url(#b-rim)" />
      <circle cx="120" cy="120" r="94" fill="#fffaf0" />
      <circle cx="120" cy="120" r="70" fill="url(#b-sun)" clipPath="url(#b-l)" />
      <circle cx="120" cy="120" r="70" fill="url(#b-moon)" clipPath="url(#b-r)" />
      <circle cx="150" cy="96" r="3" fill="#fff" /><circle cx="162" cy="126" r="2" fill="#fff" />
      <text fontFamily="Baloo 2, Mukta, sans-serif" fontWeight="800" fontSize="17" fill="#6b4a08" letterSpacing="3">
        <textPath href="#b-top" startOffset="50%" textAnchor="middle">{s.colony.badgeTop}</textPath>
      </text>
      <text fontFamily="Baloo 2, Mukta, sans-serif" fontWeight="700" fontSize="12" fill="#6b4a08" letterSpacing="2">
        <textPath href="#b-bot" startOffset="50%" textAnchor="middle">{s.colony.badgeBottom}</textPath>
      </text>
      <rect x="28" y="106" width="184" height="30" rx="8" fill="#2b1608" />
      <text x="120" y="127" textAnchor="middle" fontFamily="Baloo 2, Mukta, sans-serif" fontWeight="800" fontSize="16" fill="#fff">{short}</text>
    </svg>
  )
}

async function downloadBadge(svg: SVGSVGElement, fileName: string) {
  const xml = new XMLSerializer().serializeToString(svg)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 960
  canvas.getContext('2d')!.drawImage(img, 0, 0, 960, 960)
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = fileName
  a.click()
}

export default function Colony() {
  const { colonies } = useApp()
  const { s, f, lang } = useI18n()
  const [name, setName] = useState('')
  const [loc, setLoc] = useState<PickedLocation | null>(null)
  const [guards, setGuards] = useState(4)
  const [contact, setContact] = useState('')
  const [pledges, setPledges] = useState<boolean[]>([false, false, false, false, false])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<ColonyDoc | null>(null)
  const badgeRef = useRef<SVGSVGElement>(null)
  const items = [s.colony.p1, s.colony.p2, s.colony.p3, s.colony.p4, s.colony.p5]
  const ready = name.trim().length > 1 && loc && pledges.every(Boolean)

  const take = async () => {
    if (!ready || !loc) return
    setBusy(true)
    const doc = await store.add('colonies', {
      name: name.trim(), area: loc.area, lat: loc.lat, lon: loc.lon, guards, contact: contact.trim() || undefined, createdAt: Date.now(),
    })
    setDone(doc)
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <SectionTitle sub={s.colony.intro}>{s.colony.title}</SectionTitle>

      {done ? (
        <Panel className="text-center">
          <div className="anim-pop mx-auto w-fit">
            <TiltCard max={12}>
              <div className="pop-lg"><Badge name={done.name} size={260} svgRef={badgeRef} /></div>
            </TiltCard>
          </div>
          <h2 className="mt-4 font-display text-3xl font-extrabold">{s.colony.doneTitle}</h2>
          <p className="mt-1 text-lg text-ink-2">{f(s.colony.doneText, { name: done.name, g: done.guards })}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Btn size="lg" onClick={() => badgeRef.current && downloadBadge(badgeRef.current, `barahmasa-colony-${done.name.replace(/\W+/g, '-')}.png`)}>
              <Download className="size-5" /> {s.colony.download}
            </Btn>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Panel className="space-y-4">
            <h2 className="font-display text-xl font-extrabold">{s.colony.pledgeTitle}</h2>
            <ul className="space-y-2.5">
              {items.map((t, i) => (
                <li key={t}>
                  <button
                    type="button"
                    aria-pressed={pledges[i]}
                    onClick={() => setPledges(pledges.map((p, j) => (j === i ? !p : p)))}
                    className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-semibold transition-all ${
                      pledges[i] ? 'border-good bg-good/10 shadow-[0_4px_0_#0b7a3b]' : 'border-line bg-surface shadow-[0_4px_0_var(--line)]'
                    }`}
                  >
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${pledges[i] ? 'bg-good text-white' : 'bg-surface-2'}`}>
                      {pledges[i] && <Check className="size-5" strokeWidth={3} />}
                    </span>
                    {t}
                  </button>
                </li>
              ))}
            </ul>
            {!pledges.every(Boolean) && <p className="text-sm text-ink-3">{s.colony.need}</p>}
          </Panel>

          <Panel className="space-y-4">
            <label className="block">
              <span className="mb-1 block font-display font-extrabold">{s.colony.name}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 font-semibold" />
            </label>
            <div>
              <span className="mb-1 block font-display font-extrabold">{s.colony.area}</span>
              <LocationPicker value={loc} onChange={setLoc} />
            </div>
            <label className="block">
              <span className="mb-1 block font-display font-extrabold">{s.colony.guards}</span>
              <input type="number" min={0} max={200} value={guards} onChange={(e) => setGuards(Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
                className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 font-semibold" />
            </label>
            <label className="block">
              <span className="mb-1 block font-display font-extrabold">{s.colony.secretary}</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={60} className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3" />
            </label>
            <div className="flex items-center gap-4">
              <div className="shrink-0 opacity-90"><Badge name={name || '…'} size={96} /></div>
              <Btn size="lg" className="flex-1" disabled={!ready || busy} onClick={take}>
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Trophy className="size-5" />} {s.colony.take}
              </Btn>
            </div>
          </Panel>
        </div>
      )}

      <section>
        <h2 className="mb-3 font-display text-xl font-extrabold">{f(s.colony.wall, { n: colonies.length })}</h2>
        {colonies.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[...colonies].sort((a, b) => b.createdAt - a.createdAt).map((c) => (
              <TiltCard key={c.id} className="surface-3d p-3 text-center" max={10}>
                <div className="pop mx-auto w-fit"><Badge name={c.name} size={120} /></div>
                <div className="pop mt-1 truncate font-bold">{c.name}</div>
                <div className="pop text-xs text-ink-3">
                  {c.area} · {f(s.colony.since, { d: new Date(c.createdAt).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short', year: 'numeric' }) })}
                </div>
              </TiltCard>
            ))}
          </div>
        ) : (
          <p className="surface-3d p-6 text-center text-ink-3">{s.colony.none}</p>
        )}
      </section>
    </div>
  )
}
