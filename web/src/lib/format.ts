import type { Cell } from './types'

/** "Morar ke paas" when close, otherwise "Morar se 2.4 km uttar-purab". */
export function cellLabel(c: Pick<Cell, 'area' | 'areaKm' | 'areaDir'>) {
  if (!c.area) return 'Gwalior'
  return c.areaKm < 1.2 ? `${c.area} ke paas` : `${c.area} se ${c.areaKm} km ${c.areaDir}`
}
