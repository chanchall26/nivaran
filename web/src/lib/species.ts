/**
 * Species advisor for Gwalior (Chambal / Bundelkhand plains: hot dry summers, cold
 * winters, ~750 mm monsoon rain). Native or long-naturalised street trees only.
 * Hard constraints (wires, space, water) are enforced here, so neither the AI nor a
 * user can end up with a 20 m tree under a power line.
 */
import type { SpeciesId } from './types'

export interface Species {
  id: SpeciesId
  maxH: number
  water: 'low' | 'medium'
  shade: 1 | 2 | 3 // light, medium, dense
  /** fits a narrow footpath strip */
  narrowOk: boolean
  /** needs wide open ground (big roots / huge crown) */
  wideOnly: boolean
  /** open, airy crown: better in crowded humid lanes */
  openCrown: boolean
}

export const SPECIES: Species[] = [
  { id: 'neem', maxH: 15, water: 'low', shade: 3, narrowOk: true, wideOnly: false, openCrown: false },
  { id: 'karanj', maxH: 12, water: 'low', shade: 3, narrowOk: true, wideOnly: false, openCrown: false },
  { id: 'amaltas', maxH: 10, water: 'low', shade: 2, narrowOk: true, wideOnly: false, openCrown: true },
  { id: 'kachnar', maxH: 8, water: 'low', shade: 1, narrowOk: true, wideOnly: false, openCrown: true },
  { id: 'bael', maxH: 10, water: 'low', shade: 2, narrowOk: true, wideOnly: false, openCrown: false },
  { id: 'khejri', maxH: 8, water: 'low', shade: 1, narrowOk: true, wideOnly: false, openCrown: true },
  { id: 'arjun', maxH: 20, water: 'medium', shade: 3, narrowOk: false, wideOnly: false, openCrown: false },
  { id: 'jamun', maxH: 18, water: 'medium', shade: 3, narrowOk: false, wideOnly: false, openCrown: false },
  { id: 'pilkhan', maxH: 18, water: 'medium', shade: 3, narrowOk: false, wideOnly: true, openCrown: false },
]

export const byId = new Map(SPECIES.map((s) => [s.id, s]))

export interface SpotAnswers {
  wires: boolean | null
  space: 'narrow' | 'medium' | 'wide'
  paved: boolean
  water: boolean | null
  /** dense, crowded area (many people per cell): prefer open crowns */
  crowded: boolean
}

/** Which species are allowed at all, given the hard constraints. */
export function allowedSpecies(a: SpotAnswers): Species[] {
  return SPECIES.filter((s) => {
    if (a.wires !== false && s.maxH > 8) return false // unknown wires: play safe
    if (a.space === 'narrow' && !s.narrowOk) return false
    if (a.space !== 'wide' && s.wideOnly) return false
    if (a.water === false && s.water !== 'low') return false
    return true
  })
}

/** Rank allowed species: shade first, open crowns in crowded lanes, low water when unsure. */
export function recommend(a: SpotAnswers, n = 3): SpeciesId[] {
  return allowedSpecies(a)
    .map((s) => ({
      s,
      v: s.shade * 2 + (a.crowded && s.openCrown ? 2 : 0) + (a.water !== true && s.water === 'low' ? 1 : 0) - (a.crowded && s.shade === 3 ? 1 : 0),
    }))
    .sort((x, y) => y.v - x.v)
    .slice(0, n)
    .map(({ s }) => s.id)
}

/** Rule-based verdict when no AI is available (or to sanity-check the AI). */
export function ruleVerdict(a: SpotAnswers): 'yes' | 'maybe' | 'no' {
  if (a.space === 'narrow' && a.paved && a.water === false) return 'no'
  if (!allowedSpecies(a).length) return 'no'
  if (a.paved || a.space === 'narrow' || a.wires !== false || a.water === false) return 'maybe'
  return 'yes'
}

/** Keys into strings.trees.reasons explaining the constraints. */
export type ReasonKey = 'wires' | 'wiresUnsure' | 'narrow' | 'paved' | 'noWater' | 'open'
export function reasonKeys(a: SpotAnswers): ReasonKey[] {
  const out: ReasonKey[] = []
  if (a.wires === true) out.push('wires')
  if (a.wires === null) out.push('wiresUnsure')
  if (a.space === 'narrow') out.push('narrow')
  if (a.paved) out.push('paved')
  if (a.water === false) out.push('noWater')
  if (!out.length) out.push('open')
  return out
}
