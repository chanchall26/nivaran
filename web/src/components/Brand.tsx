import { useI18n } from '../i18n'

/** A 3D orb, half sun and half moon: the year in one mark. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="drop-shadow-[0_4px_6px_rgb(var(--shade)/0.35)]">
      <defs>
        <radialGradient id="bm-sun" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff3b8" />
          <stop offset="0.45" stopColor="#ffb52e" />
          <stop offset="1" stopColor="#e2571e" />
        </radialGradient>
        <radialGradient id="bm-moon" cx="65%" cy="30%" r="80%">
          <stop offset="0" stopColor="#dbe7ff" />
          <stop offset="0.5" stopColor="#5d86d8" />
          <stop offset="1" stopColor="#1b2f73" />
        </radialGradient>
        <clipPath id="bm-left"><rect x="0" y="0" width="32" height="64" /></clipPath>
        <clipPath id="bm-right"><rect x="32" y="0" width="32" height="64" /></clipPath>
      </defs>
      <circle cx="32" cy="32" r="29" fill="url(#bm-sun)" clipPath="url(#bm-left)" />
      <circle cx="32" cy="32" r="29" fill="url(#bm-moon)" clipPath="url(#bm-right)" />
      <circle cx="44" cy="22" r="2" fill="#fff" opacity="0.9" />
      <circle cx="50" cy="36" r="1.3" fill="#fff" opacity="0.7" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="rgb(255 255 255 / .35)" strokeWidth="1.5" />
    </svg>
  )
}

export function Brand() {
  const { s } = useI18n()
  return (
    <span className="flex items-center gap-2">
      <BrandMark />
      <span className="leading-none">
        <span className="block font-display text-lg font-extrabold tracking-tight sm:text-xl">{s.app.name}</span>
        <span className="hidden text-[11px] font-semibold text-ink-3 sm:block">{s.app.city}</span>
      </span>
    </span>
  )
}
