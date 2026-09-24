/**
 * The hero: one guard post, two seasons. A 3D card that flips when the season changes;
 * each face is built from SVG layers at different depths, so moving the pointer
 * gives real parallax. Pure SVG/CSS, no images.
 */
import { useI18n } from '../i18n'
import { useApp } from '../state'
import { useTilt } from './kit'

/** Translate a layer by the pointer position (--px/--py set by useTilt) times its depth. */
const depth = (d: number) => ({
  transform: `translate3d(calc(var(--px, 0) * ${d * -26}px), calc(var(--py, 0) * ${d * -18}px), ${d * 30}px)`,
})

function Guard({ sitting = false, x = 0, y = 0 }: { sitting?: boolean; x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {sitting ? (
        <>
          <rect x="-15" y="-34" width="30" height="34" rx="10" fill="#2d3a6b" />
          <rect x="-15" y="-8" width="36" height="12" rx="6" fill="#23305c" />
          <circle cx="0" cy="-46" r="11" fill="#c98d64" />
          <path d="M-12 -50 q12 -14 24 0 v-4 h-24z" fill="#1c2750" />
        </>
      ) : (
        <>
          <rect x="-8" y="-20" width="7" height="22" rx="3" fill="#3a2a1d" />
          <rect x="1" y="-20" width="7" height="22" rx="3" fill="#3a2a1d" />
          <rect x="-13" y="-52" width="26" height="36" rx="9" fill="#35507f" />
          <circle cx="0" cy="-63" r="11" fill="#b87a52" />
          <path d="M-13 -66 q13 -15 26 0 v-3 h-26z" fill="#22375e" />
          <rect x="-16" y="-68" width="32" height="4" rx="2" fill="#22375e" />
        </>
      )}
    </g>
  )
}

function Gate({ dark }: { dark: boolean }) {
  const post = dark ? '#26335f' : '#b9784d'
  const bar = dark ? '#34437a' : '#d49a6a'
  return (
    <g>
      <rect x="40" y="150" width="22" height="110" rx="3" fill={post} />
      <rect x="250" y="150" width="22" height="110" rx="3" fill={post} />
      <rect x="36" y="142" width="30" height="12" rx="3" fill={bar} />
      <rect x="246" y="142" width="30" height="12" rx="3" fill={bar} />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={70 + i * 20} y="170" width="6" height="90" rx="2" fill={bar} opacity="0.9" />
      ))}
      <rect x="62" y="186" width="188" height="6" rx="3" fill={bar} />
      <rect x="62" y="236" width="188" height="6" rx="3" fill={bar} />
    </g>
  )
}

function Skyline({ color }: { color: string }) {
  return (
    <path
      fill={color}
      d="M0 210 V150 h30 v-20 h24 v30 h20 v-45 h28 v35 h18 v-25 h30 v40 h22 v-55 h26 v45 h20 v-30 h34 v38 h24 v-22 h30 v35 h18 v-18 h56 V210z"
    />
  )
}

function GarmiFace() {
  return (
    <div className="flip-face" style={{ background: 'linear-gradient(180deg,#ffb35c 0%,#ffd08f 45%,#ffe7c4 100%)' }}>
      <div className="layer" style={depth(0.4)}>
        <svg viewBox="0 0 400 300" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <circle cx="310" cy="70" r="70" fill="#fff3b0" opacity="0.35" />
          <circle cx="310" cy="70" r="44" fill="#fff0a0" />
          <circle cx="310" cy="70" r="34" fill="#ffd23f" />
        </svg>
      </div>
      <div className="layer" style={depth(0.8)}>
        <svg viewBox="0 0 400 300" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <g transform="translate(0 30)"><Skyline color="#f0a36a" /></g>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${60 + i * 110} 205 q10 -12 0 -24 q-10 -12 0 -24`} stroke="#fff5e0" strokeWidth="3" fill="none"
              style={{ animation: `shimmer ${2.4 + i * 0.4}s ease-in-out infinite` }} />
          ))}
        </svg>
      </div>
      <div className="layer" style={depth(1.4)}>
        <svg viewBox="0 0 400 300" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <rect x="0" y="250" width="400" height="50" fill="#e98a4f" />
          <rect x="0" y="250" width="400" height="6" fill="#f6a56b" />
          <Gate dark={false} />
          <Guard x={320} y={262} />
          {/* a lonely dry sapling: planted, but not where the guard stands */}
          <g transform="translate(372 262)">
            <rect x="-1.5" y="-26" width="3" height="26" fill="#8a5a36" />
            <path d="M0 -24 q-10 -6 -12 -14 M0 -18 q9 -5 12 -12" stroke="#8a5a36" strokeWidth="2" fill="none" />
          </g>
          <ellipse cx="320" cy="264" rx="18" ry="4" fill="#b8612e" opacity="0.5" />
        </svg>
      </div>
    </div>
  )
}

function SardiFace() {
  return (
    <div className="flip-face flip-back" style={{ background: 'linear-gradient(180deg,#070d2b 0%,#15225a 60%,#26336e 100%)' }}>
      <div className="layer" style={depth(0.4)}>
        <svg viewBox="0 0 400 300" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {[[40, 40], [90, 20], [150, 55], [200, 25], [250, 60], [360, 30], [120, 90], [300, 100], [20, 110]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 ? 1.4 : 2.2} fill="#fff" opacity={0.6 + (i % 3) * 0.15}
              style={{ animation: `twinkle ${2 + (i % 4)}s ease-in-out infinite alternate` }} />
          ))}
          <circle cx="320" cy="65" r="48" fill="#8fb3ff" opacity="0.18" />
          <circle cx="320" cy="65" r="30" fill="#eef3ff" />
          <circle cx="332" cy="58" r="26" fill="#15225a" />
        </svg>
      </div>
      <div className="layer" style={depth(0.8)}>
        <svg viewBox="0 0 400 300" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <g transform="translate(0 30)"><Skyline color="#1b275a" /></g>
          {/* a low, flat smoke layer: the smoke-trap night */}
          <rect x="0" y="200" width="400" height="26" fill="#9aa6c9" opacity="0.18" />
        </svg>
      </div>
      <div className="layer" style={depth(1.4)}>
        <svg viewBox="0 0 400 300" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <rect x="0" y="250" width="400" height="50" fill="#1a2552" />
          <ellipse cx="330" cy="256" rx="70" ry="16" fill="#ff8a3d" opacity="0.22" />
          <Gate dark />
          <Guard sitting x={298} y={258} />
          <g transform="translate(340 256)">
            {[0, 1, 2].map((i) => (
              <circle key={i} cx={-4 + i * 4} cy={-30} r={7 + i * 2} fill="#c0c8e0" opacity="0.4"
                style={{ animation: `smoke ${2.4 + i * 0.5}s ease-out ${i * 0.7}s infinite` }} />
            ))}
            <g className="anim-flicker">
              <path d="M-14 0 q2 -26 14 -34 q12 8 14 34z" fill="#ff6a1a" />
              <path d="M-8 0 q2 -16 8 -22 q7 6 8 22z" fill="#ffc23d" />
            </g>
            <rect x="-18" y="-2" width="36" height="5" rx="2" fill="#5a3a22" />
          </g>
        </svg>
      </div>
    </div>
  )
}

export function SeasonScene() {
  const { season } = useApp()
  const { s } = useI18n()
  const tilt = useTilt<HTMLDivElement>(6)
  return (
    <div className="flip-stage" ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave}>
      <div className="tilt">
        <div
          className={`flip-card aspect-[4/3] w-full rounded-[2rem] shadow-[var(--shadow-3d-lg)] ${season === 'sardi' ? 'is-sardi' : ''}`}
          role="img"
          aria-label={season === 'sardi' ? s.home.sceneSardi : s.home.sceneGarmi}
        >
          <GarmiFace />
          <SardiFace />
        </div>
      </div>
      <div className="relative z-10 mx-auto -mt-7 w-fit rounded-full border border-line bg-glass px-4 py-2 font-display text-sm font-bold shadow-[var(--shadow-float)] backdrop-blur">
        {season === 'sardi' ? s.home.sceneSardi : s.home.sceneGarmi}
      </div>
    </div>
  )
}
