import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { STRINGS, type Lang, type Strings } from './strings'

export type { Lang }

/** Fill `{name}` placeholders. Numbers are formatted for the current language. */
export function fmt(template: string, params: Record<string, string | number> = {}, lang: Lang = 'en') {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k]
    if (v == null) return `{${k}}`
    return typeof v === 'number' ? v.toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN') : v
  })
}

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  s: Strings
  f: (template: string, params?: Record<string, string | number>) => string
  num: (n: number, digits?: number) => string
}

const Ctx = createContext<I18n | null>(null)
const KEY = 'barahmasa:lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'hi') return saved
  } catch {
    /* storage blocked */
  }
  return navigator.language?.startsWith('hi') ? 'hi' : 'en'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const value: I18n = {
    lang,
    setLang: (l) => {
      setLangState(l)
      try {
        localStorage.setItem(KEY, l)
      } catch {
        /* not remembered */
      }
    },
    s: STRINGS[lang],
    f: (t, p) => fmt(t, p, lang),
    num: (n, digits = 0) =>
      n.toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 }),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside LangProvider')
  return v
}
