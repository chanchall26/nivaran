/** Dates and times in Asia/Kolkata, whatever the device's own timezone is. */

export const TZ = 'Asia/Kolkata'

/** YYYY-MM-DD for "now" in IST. */
export function istToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Current hour 0-23 in IST. */
export function istHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now))
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const isIsoDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))

const loc = (lang: 'en' | 'hi') => (lang === 'hi' ? 'hi-IN' : 'en-IN')

/** "10:42 am" */
export function clockTime(now: Date, lang: 'en' | 'hi') {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(now)
    .replace('AM', 'am')
    .replace('PM', 'pm')
}

/** "Saturday, 26 September" */
export function clockDate(now: Date, lang: 'en' | 'hi') {
  const p = new Intl.DateTimeFormat(loc(lang), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).formatToParts(now)
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${get('weekday')}, ${get('day')} ${get('month')}`
}

/** Weekday name for an ISO date: "Sunday" / "रविवार" */
export function weekday(iso: string, lang: 'en' | 'hi') {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: 'UTC', weekday: 'long' }).format(new Date(iso + 'T00:00:00Z'))
}

/** "19 May 2026" */
export function longDate(iso: string, lang: 'en' | 'hi') {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T00:00:00Z'))
}

/** "4 pm" / "शाम 4 बजे" style short hour label. */
export function hourLabel(h: number, lang: 'en' | 'hi') {
  if (lang === 'hi') {
    const part = h < 4 || h >= 20 ? 'रात' : h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : 'शाम'
    return `${part} ${h % 12 === 0 ? 12 : h % 12} बजे`
  }
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`
}

/** "2 min ago" */
export function ago(ms: number, lang: 'en' | 'hi') {
  const m = Math.max(0, Math.round(ms / 60000))
  if (lang === 'hi') {
    if (m < 1) return 'अभी'
    if (m < 60) return `${m} मिनट पहले`
    const h = Math.round(m / 60)
    return h < 24 ? `${h} घंटे पहले` : `${Math.round(h / 24)} दिन पहले`
  }
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}
