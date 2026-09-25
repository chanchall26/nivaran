import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { UI, type Dict } from './ui'

export type Lang = 'en' | 'hi'

/** Fill `{name}` placeholders. Numbers are formatted for the current language (digits stay digits). */
export function fmt(template: string, params: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k]
    if (v == null) return `{${k}}`
    return typeof v === 'number' ? v.toLocaleString('en-IN') : v
  })
}

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: Dict
  f: (template: string, params?: Record<string, string | number>) => string
  num: (n: number, digits?: number) => string
}

const Ctx = createContext<I18n | null>(null)
const KEY = 'bm:lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'hi') return saved
  } catch {
    /* storage blocked */
  }
  // English by default; one tap switches to Hindi
  return 'en'
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
    t: UI[lang],
    f: fmt,
    num: (n, digits = 0) => n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 }),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside LangProvider')
  return v
}
