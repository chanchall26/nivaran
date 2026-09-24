/**
 * Map markers as SVG data URLs (deck.gl IconLayer auto-packs them). Identity is carried
 * by the glyph, not by colour, so the heat/cold ramps stay the only colour story on the map.
 */
import {
  Bus,
  Flame,
  HardHat,
  House,
  type LucideIcon,
  Moon,
  Package,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Users,
} from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PlaceKind } from './types'

export const PLACE_META: Record<PlaceKind, { label: string; Icon: LucideIcon }> = {
  guard_post: { label: 'Guard post', Icon: ShieldCheck },
  rehri_zone: { label: 'Rehri / market', Icon: ShoppingCart },
  transit: { label: 'Bus / rail', Icon: Bus },
  worksite: { label: 'Worksite', Icon: HardHat },
  shelter: { label: 'Rain basera', Icon: House },
  homeless_spot: { label: 'Beghar log', Icon: Moon },
  labour_chowk: { label: 'Mazdoor chowk', Icon: Users },
}

const cache = new Map<string, string>()

/** A round badge: white disc, dark ring, glyph. `ring` lets reports/deliveries stand out. */
export function badgeUrl(Icon: LucideIcon, key: string, ring = '#1d1b18', fill = '#ffffff', glyph = '#1d1b18') {
  const k = `${key}|${ring}|${fill}`
  if (!cache.has(k)) {
    const inner = renderToStaticMarkup(<Icon size={18} color={glyph} strokeWidth={2.2} x={7} y={7} />)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${fill}" stroke="${ring}" stroke-width="2.5"/>${inner}</svg>`
    cache.set(k, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  }
  return cache.get(k)!
}

export const placeIcon = (kind: PlaceKind) => ({
  url: badgeUrl(PLACE_META[kind].Icon, kind),
  id: kind,
  width: 32,
  height: 32,
})

export const reportIcon = (season: 'garmi' | 'sardi', resolved: boolean) => {
  const color = resolved ? '#0ca30c' : '#d03b3b'
  return {
    url: badgeUrl(season === 'sardi' ? Flame : Sun, `report-${season}`, color, color, '#ffffff'),
    id: `report-${season}-${resolved}`,
    width: 32,
    height: 32,
  }
}

export const deliveryIcon = () => ({
  url: badgeUrl(Package, 'delivery', '#1d1b18', '#1d1b18', '#ffffff'),
  id: 'delivery',
  width: 32,
  height: 32,
})
