import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromSnapshot, SNAP_CITIES, summerDayFrom, summerPeakFrom, type AirFile, type SnapCity, type SummerDayFile, type SummerFile, type WeatherFile } from './snapshot'

const read = <T,>(f: string): T => JSON.parse(readFileSync(resolve(__dirname, '../../public/snapshots', f), 'utf-8'))
const files = (c: SnapCity) => ({
  w: read<WeatherFile>(`${c}-weather.json`),
  a: read<AirFile>(`${c}-air.json`),
  s: read<SummerFile>(`${c}-summer.json`),
  sd: read<SummerDayFile>(`${c}-summer-day.json`),
})

describe('saved forecasts (real API responses)', () => {
  it.each(SNAP_CITIES)('%s: files carry saved_at in IST and real hourly data', (c) => {
    const { w, a, s, sd } = files(c)
    for (const f of [w, a, s, sd]) expect(f.saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/)
    expect(w.hourly.time.length).toBe(w.daily.time.length * 24)
    expect(a.hourly?.pm2_5.some((v) => v != null)).toBe(true)
    expect(s.daily.time[0]).toBe('2026-05-01')
    expect(sd.hourly.time).toHaveLength(24)
  })

  it.each(SNAP_CITIES)('%s: becomes a saved (never live) forecast whose "now" is the current IST hour', (c) => {
    const { w, a } = files(c)
    const start = w.daily.time[0]
    const l = fromSnapshot(c, w, a, start, 14)!
    expect(l.from).toBe('cache')
    expect(l.stale).toBe(false)
    expect(l.savedAt).toBe(Date.parse(w.saved_at))
    expect(l.data.days[0].date).toBe(start)
    expect(l.data.days[0].hours).toHaveLength(24)
    expect(l.data.current.time).toBe(`${start}T14:00`)
    expect(l.data.current.feels).toBe(l.data.days[0].hours[14].feels)
    expect(l.data.air?.aqi).toBe(l.data.days[0].hours[14].aqi)
    expect(l.data.elevation).toBeGreaterThan(100)
    for (const d of l.data.days) for (const h of d.hours) expect(Number.isFinite(h.feels)).toBe(true)
  })

  it('never shows a saved file as a day it does not cover', () => {
    const { w, a } = files('delhi')
    expect(fromSnapshot('delhi', w, a, '2026-09-20', 12)).toBeNull()
    const later = fromSnapshot('delhi', w, a, w.daily.time[1], 12)!
    expect(later.data.days[0].date).toBe(w.daily.time[1])
    expect(later.data.days).toHaveLength(w.daily.time.length - 1)
  })

  it('Leh is a cold night on the first saved day', () => {
    const { w, a } = files('leh')
    const l = fromSnapshot('leh', w, a, w.daily.time[0], 22)!
    expect(l.data.days[0].fmin).toBeLessThanOrEqual(10)
    expect(l.data.elevation).toBeGreaterThan(3000)
  })

  it('last summer: peak and hottest day for planting and the hot-hours what-if', () => {
    const g = summerPeakFrom(files('gwalior').s)!
    const l = summerPeakFrom(files('leh').s)!
    expect(g.peak).toBeGreaterThanOrEqual(40)
    expect(l.peak).toBeLessThan(32) // cold desert
    const day = summerDayFrom('gwalior', files('gwalior').sd)!
    expect(day.data.kind).toBe('replay')
    expect(day.data.replayDate).toBe(g.hottest)
    expect(Math.max(...day.data.days[0].hours.map((h) => h.feels))).toBeCloseTo(g.feels, 0)
  })
})
