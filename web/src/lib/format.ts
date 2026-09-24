import type { Strings } from '../i18n/strings'
import { fmt, type Lang } from '../i18n'
import type { Cell } from './types'

/** "Near Morar" / "2.4 km north of Morar" (and the Hindi equivalents). */
export function cellLabel(c: Pick<Cell, 'area' | 'areaHi' | 'areaKm' | 'areaDir'>, s: Strings, lang: Lang) {
  if (!c.area) return s.app.city
  const area = lang === 'hi' && c.areaHi ? c.areaHi : c.area
  if (c.areaKm < 1.2) return fmt(s.where.near, { area }, lang)
  const dir = s.dir[c.areaDir as keyof Strings['dir']] ?? c.areaDir
  return fmt(s.where.far, { area, km: c.areaKm, dir }, lang)
}

/** Name for a planned delivery: the OSM name if there is one, else "<kind>, <where>". */
export function allocName(
  target: { kind: 'place'; place: { name: string | null; kind: keyof Strings['place'] } } | { kind: 'cell' },
  cell: Pick<Cell, 'area' | 'areaHi' | 'areaKm' | 'areaDir'>,
  s: Strings,
  lang: Lang,
) {
  const where = cellLabel(cell, s, lang)
  if (target.kind === 'place') return target.place.name ?? `${s.place[target.place.kind]}, ${where}`
  return `${s.match.street}, ${where}`
}
