import { HandHeart, IndianRupee } from 'lucide-react'
import { BtnLink, Panel, SectionTitle, TiltCard, useTilt } from '../components/kit'
import { useI18n } from '../i18n'
import { useApp } from '../state'

/** A cutaway cabin that changes with the season: sun bouncing off the roof, or a warm glow inside. */
function CabinScene() {
  const { season } = useApp()
  const sardi = season === 'sardi'
  const tilt = useTilt<HTMLDivElement>(8)
  const layer = (d: number) => ({ transform: `translate3d(calc(var(--px,0) * ${-d * 22}px), calc(var(--py,0) * ${-d * 14}px), ${d * 30}px)` })
  const pin = (x: number, y: number, n: number) => (
    <g transform={`translate(${x} ${y})`}>
      <circle r="13" fill="#2b1608" stroke="#fff" strokeWidth="3" />
      <text y="5" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff" fontFamily="Baloo 2, sans-serif">{n}</text>
    </g>
  )
  return (
    <div ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave} className="tilt">
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-[2rem] shadow-[var(--shadow-3d-lg)]"
        style={{ background: sardi ? 'linear-gradient(#070d2b,#1b2860)' : 'linear-gradient(#ffb35c,#ffe7c4)', transformStyle: 'preserve-3d' }}
      >
        <div className="layer" style={layer(0.4)}>
          <svg viewBox="0 0 400 300" className="size-full" aria-hidden>
            {sardi ? (
              <>
                {[[40, 30], [120, 50], [220, 24], [300, 60], [360, 36]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill="#fff" />)}
                <circle cx="330" cy="60" r="24" fill="#eef3ff" /><circle cx="340" cy="54" r="21" fill="#0d1742" />
              </>
            ) : (
              <>
                <circle cx="330" cy="60" r="34" fill="#ffd23f" />
                {/* rays hitting the white roof and bouncing back up */}
                <path d="M310 90 L205 130 L150 60" stroke="#fff5c0" strokeWidth="3" fill="none" strokeDasharray="6 6" />
                <path d="M320 95 L235 132 L205 55" stroke="#fff5c0" strokeWidth="3" fill="none" strokeDasharray="6 6" />
              </>
            )}
          </svg>
        </div>
        <div className="layer" style={layer(1.1)}>
          <svg viewBox="0 0 400 300" className="size-full" aria-hidden>
            <rect x="0" y="250" width="400" height="50" fill={sardi ? '#1a2552' : '#e98a4f'} />
            {/* tree (west side) */}
            <rect x="58" y="170" width="10" height="82" rx="3" fill="#8a5a36" />
            <circle cx="63" cy="160" r="40" fill="#3f9b3a" />
            <circle cx="50" cy="150" r="18" fill="rgb(255 255 255 / .15)" />
            {/* cabin: walls with insulation layer visible in cutaway */}
            <rect x="140" y="140" width="150" height="112" fill={sardi ? '#2e3d78' : '#d8c3a5'} />
            <rect x="140" y="140" width="12" height="112" fill="#f4d35e" />
            <rect x="278" y="140" width="12" height="112" fill="#f4d35e" />
            <rect x="152" y="152" width="126" height="100" fill={sardi ? '#3b2a1e' : '#fff3e2'} />
            {sardi && <ellipse cx="215" cy="222" rx="70" ry="32" fill="#ff8a3d" opacity=".35" />}
            {/* cool roof */}
            <path d="M126 142 L215 104 L304 142 Z" fill="#ffffff" stroke="#dfe6ef" strokeWidth="3" />
            {/* windows */}
            <rect x="162" y="172" width="32" height="26" rx="3" fill={sardi ? '#ffcf73' : '#9fd3ff'} stroke="#6b4a33" strokeWidth="3" />
            <rect x="236" y="172" width="32" height="26" rx="3" fill={sardi ? '#ffcf73' : '#9fd3ff'} stroke="#6b4a33" strokeWidth="3" />
            {/* heater */}
            <rect x="200" y="226" width="30" height="22" rx="4" fill="#555" />
            <rect x="204" y="230" width="22" height="6" rx="2" fill={sardi ? '#ff6a1a' : '#888'} />
            {/* guard inside */}
            <circle cx="248" cy="212" r="8" fill="#b87a52" />
            <rect x="240" y="220" width="16" height="30" rx="6" fill="#35507f" />
          </svg>
        </div>
        <div className="layer" style={layer(1.6)}>
          <svg viewBox="0 0 400 300" className="size-full" aria-hidden>
            {pin(215, 96, 1)}
            {pin(146, 128, 2)}
            {pin(178, 166, 3)}
            {pin(63, 110, 4)}
            {pin(215, 214, 5)}
          </svg>
        </div>
      </div>
    </div>
  )
}

export default function Cabin() {
  const { s } = useI18n()
  const parts: [string, string][] = [
    [s.cabin.roof, s.cabin.roofD],
    [s.cabin.walls, s.cabin.wallsD],
    [s.cabin.window, s.cabin.windowD],
    [s.cabin.tree, s.cabin.treeD],
    [s.cabin.heater, s.cabin.heaterD],
  ]
  return (
    <div className="space-y-6">
      <SectionTitle sub={s.cabin.intro}>{s.cabin.title}</SectionTitle>
      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
        <CabinScene />
        <ol className="space-y-3">
          {parts.map(([t, d], i) => (
            <li key={t} className="surface-3d flex gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink font-display font-extrabold text-bg">{i + 1}</span>
              <div>
                <div className="font-display text-lg font-extrabold">{t}</div>
                <p className="text-sm text-ink-2">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <TiltCard className="surface-3d p-6" max={5}>
          <IndianRupee className="pop size-8 text-accent" aria-hidden />
          <div className="pop mt-2 font-display text-3xl font-extrabold">{s.cabin.cost}</div>
          <p className="pop text-ink-2">{s.cabin.costD}</p>
        </TiltCard>
        <Panel>
          <div className="font-display text-xl font-extrabold">{s.cabin.where}</div>
          <p className="mt-1 text-ink-2">{s.cabin.whereD}</p>
          <BtnLink to="/match?item=cabin" className="mt-4">
            <HandHeart className="size-5" aria-hidden /> {s.cabin.plan}
          </BtnLink>
        </Panel>
      </div>
    </div>
  )
}
