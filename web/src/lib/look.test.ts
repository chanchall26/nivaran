import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOOK } from '../i18n/look'

describe('login and shell words: Hindi and English match', () => {
  const walk = (a: unknown, b: unknown, path: string, out: string[]) => {
    if (typeof a === 'string') {
      if (typeof b !== 'string') return out.push(`${path}: missing`)
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
      if (ph(a) !== ph(b)) out.push(`${path}: placeholders differ`)
      return
    }
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return out.push(`${path}: array length`)
      a.forEach((x, i) => walk(x, b[i], `${path}[${i}]`, out))
      return
    }
    for (const k of Object.keys(a as object)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)?.[k], `${path}.${k}`, out)
  }
  it('every key, list and placeholder matches', () => {
    const out: string[] = []
    walk(LOOK.en, LOOK.hi, 'look', out)
    expect(out).toEqual([])
  })
  it('Hindi is in Devanagari', () => {
    for (const s of [LOOK.hi.login.welcome, LOOK.hi.login.detect, LOOK.hi.login.placeTitle, LOOK.hi.login.start]) expect(s).toMatch(/[ऀ-ॿ]/)
  })
})

describe('3D emoji files', () => {
  it('every emoji the code names is in public/emoji', async () => {
    const files = new Set(readdirSync(resolve(__dirname, '../../public/emoji')).map((f) => f.replace(/\.png$/, '')))
    const src = (await import('node:fs')).readFileSync(resolve(__dirname, '../ui/Emoji.tsx'), 'utf-8')
    const union = src.slice(src.indexOf('export type EmojiName'), src.indexOf('export function Emoji'))
    const names = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(50)
    expect(names.filter((n) => !files.has(n))).toEqual([])
  })
})
