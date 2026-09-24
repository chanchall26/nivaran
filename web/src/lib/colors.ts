import type { Season } from './types'

type RGB = [number, number, number]

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/**
 * One-hue sequential ramps from low need to high need. Summer sits on a light map, so
 * more need = darker orange; winter sits on a night map, so more need = brighter ice-blue.
 */
export const RAMPS: Record<Season, string[]> = {
  garmi: ['#fde0cf', '#f9bfa0', '#f39b70', '#eb6834', '#c9501f', '#a03d15', '#772c0e'],
  sardi: ['#1d3a86', '#2a55b4', '#3f78dc', '#64a0f2', '#94c2ff', '#c4ddff', '#eef6ff'],
}

const RGB_RAMPS = { garmi: RAMPS.garmi.map(hex), sardi: RAMPS.sardi.map(hex) }

/** Colour for a need in 0..1. Very low need fades out so the basemap shows through. */
export function needColor(season: Season, need: number): [number, number, number, number] {
  const r = RGB_RAMPS[season]
  const x = Math.min(1, Math.max(0, need)) * (r.length - 1)
  const i = Math.min(r.length - 2, Math.floor(x))
  const t = x - i
  const c = r[i].map((v, k) => Math.round(v + (r[i + 1][k] - v) * t)) as RGB
  const alpha = need < 0.08 ? 40 : 90 + Math.round(need * 130)
  return [...c, alpha]
}

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const
