import { describe, expect, it } from 'vitest'
import { UI } from '../i18n/ui'
import { addDays, clockDate, hourLabel, istToday } from './ist'
import { buildDays } from './live'
import { at, DAY, demoHistory, learn, monthlyTrend, peh, reasonCounts, taskState } from './checks'
import { FILE_HEATER_RATE, HELP, heaterValue, optionsFor, suggestPlan } from './plan'
import type { Point } from './points'
import { pointRisk, protectionOf, resilienceDebt, topNeed } from './points'
import {
  aqiParts, grapStage, inNcr, mainPollutant,
  airProblem, aqiCategory, burningRisk, climateOf, coldLevel, coldSpan, conditionOf, dayLevel, fireRisk, heatLevel, heatSpan, hourLevel, indianAqi,
  modesOf, needsFor, nightStats, plantingNow, rituOf, trendOf, worstAirSpan, type Day, type Hour,
} from './risk'
import { sanitizeDb, type Check, type Task } from './tasks'
import { validLatLon } from './place'

const hour = (h: number, over: Partial<Hour> = {}): Hour => ({
  time: `2026-09-26T${String(h).padStart(2, '0')}:00`, hour: h, temp: 25, feels: 25, rh: 50, rainProb: 0, rain: 0, wind: 10, pm25: 20, pm10: 40, aqi: 40, ...over,
})
const day = (over: Partial<Day> = {}, hours?: Hour[]): Day => {
  const hs = hours ?? Array.from({ length: 24 }, (_, h) => hour(h))
  return {
    date: '2026-09-26', hours: hs,
    tmax: Math.max(...hs.map((x) => x.temp)), tmin: Math.min(...hs.map((x) => x.temp)),
    fmax: Math.max(...hs.map((x) => x.feels)), fmin: Math.min(...hs.map((x) => x.feels)),
    rainProbMax: 0, rainSum: 0, aqi: 40, ...over,
  }
}

describe('Indian AQI (CPCB breakpoints)', () => {
  it('maps breakpoints to the AQI scale', () => {
    expect(indianAqi(30, null)).toBe(50)
    expect(indianAqi(60, null)).toBe(100)
    expect(indianAqi(90, null)).toBe(200)
    expect(indianAqi(120, null)).toBe(300)
    expect(indianAqi(250, null)).toBe(400)
    expect(indianAqi(null, 100)).toBe(100)
    expect(indianAqi(null, 350)).toBe(300)
  })
  it("uses CPCB's discrete bands: a value between two bands starts at the next band's floor", () => {
    expect(indianAqi(30.5, null)).toBe(51)
    expect(indianAqi(45, null)).toBe(75)
    expect(indianAqi(121, null)).toBe(301)
    expect(indianAqi(null, 51)).toBe(51)
    expect(indianAqi(900, null)).toBe(500)
  })
  it('takes the higher of PM2.5 and PM10', () => {
    expect(indianAqi(24, 200)).toBe(indianAqi(null, 200))
    expect(indianAqi(null, null)).toBeNull()
  })
  it('names the categories', () => {
    expect([40, 86, 150, 250, 350, 450].map(aqiCategory)).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('danger level per hour', () => {
  it('heat and cold thresholds', () => {
    expect([31.9, 32, 37.9, 38, 42.9, 43].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3])
    expect([15, 14.9, 10, 9.9, 5, 4.9].map(coldLevel)).toEqual([0, 1, 1, 2, 2, 3])
  })
  it('air raises the level', () => {
    expect(hourLevel({ feels: 25, aqi: 250 })).toBe(2)
    expect(hourLevel({ feels: 25, aqi: 320 })).toBe(3)
    expect(hourLevel({ feels: 40, aqi: 250 })).toBe(2)
  })
})

describe('modes and needs', () => {
  it('mild when no rule fires', () => {
    expect(modesOf(day())).toEqual(['mild'])
    expect(needsFor(['mild'])).toEqual(['low_risk'])
  })
  it('cold night, heat, humid, rain and smoke in rule order, at most two', () => {
    expect(modesOf(day({ fmin: 9 }))).toEqual(['cold'])
    expect(modesOf(day({ tmax: 39 }))).toEqual(['heat'])
    const humid = day({}, Array.from({ length: 24 }, (_, h) => hour(h, { temp: 34, rh: 70 })))
    expect(modesOf(humid)).toEqual(['humid'])
    expect(modesOf(day({ rainProbMax: 70, aqi: 250 }))).toEqual(['rain', 'smoky'])
    expect(modesOf(day({ fmin: 5, rainProbMax: 80, aqi: 320 }))).toEqual(['cold', 'rain'])
  })
  it('needs: 3 to 5 cards, primary mode first', () => {
    const n = needsFor(['cold', 'smoky'])
    expect(n[0]).toBe('warm_kit')
    expect(n.length).toBeLessThanOrEqual(5)
    expect(needsFor(['heat']).length).toBeGreaterThanOrEqual(3)
  })
  it('ritu from the month', () => {
    expect([1, 3, 5, 7, 9, 11].map(rituOf)).toEqual(['shishir', 'vasant', 'grishma', 'varsha', 'sharad', 'hemant'])
  })
})

describe('fire risk tonight', () => {
  const cold = day({}, Array.from({ length: 24 }, (_, h) => hour(h, { feels: 3, wind: 4 })))
  it('high needs all three', () => {
    expect(fireRisk(nightStats(cold), 'unconfirmed')).toBe('high')
    expect(fireRisk(nightStats(cold), 'working')).toBe('medium')
    const windy = day({}, Array.from({ length: 24 }, (_, h) => hour(h, { feels: 8, wind: 12 })))
    expect(fireRisk(nightStats(windy), 'unconfirmed')).toBe('low')
  })
})

describe('trend line for mild days', () => {
  it('says warmer from the first warm day', () => {
    const days = [20, 21, 25, 26, 24].map((t, i) => day({ date: addDays('2026-09-26', i), tmax: t, tmin: 15 }))
    expect(trendOf(days)).toEqual({ kind: 'warmer', date: '2026-09-28', value: 26 })
  })
  it('says the same when nothing moves', () => {
    const days = [30, 30.5, 31, 30, 29].map((t, i) => day({ date: addDays('2026-09-26', i), tmax: t, tmin: 20 }))
    expect(trendOf(days)?.kind).toBe('same')
  })
})

describe('points', () => {
  const guard: Point = {
    id: 'atm', name: 'ATM', nameHi: 'एटीएम', lat: 0, lon: 0, type: 'atm', ward: 'A', wardHi: 'ए',
    people: [{ group: 'guard', count: 1, shift: 'night' }], heater: 'unconfirmed',
  }
  const vendors: Point = { ...guard, id: 'mkt', type: 'market', ward: 'B', people: [{ group: 'vendor', count: 30, shift: 'day' }], heater: undefined }
  it('night shift only sees night hours', () => {
    const hs = Array.from({ length: 24 }, (_, h) => hour(h, { feels: h >= 12 && h < 16 ? 44 : 20 }))
    expect(pointRisk(guard, day({}, hs), undefined, ['heat']).level).toBe(0)
    expect(pointRisk(vendors, day({}, hs), undefined, ['heat']).level).toBe(3)
  })
  it('cold night: unconfirmed heater means check the socket first', () => {
    expect(topNeed(guard, ['cold'])).toBe('heater_check')
    expect(topNeed(guard, ['cold'], 'working')).toBe('warm_kit')
    expect(topNeed(vendors, ['heat'])).toBe('shade')
  })
  it('planner: most protected hours per rupee, within budget', () => {
    const opts = [guard, vendors].flatMap((p) => optionsFor(p, ['cold', 'heat']))
    expect(opts.some((o) => o.help === 'socket_fix')).toBe(true)
    const plan = suggestPlan(opts, 10000, false)
    expect(plan.spent).toBeLessThanOrEqual(10000)
    expect(plan.picks.length).toBeGreaterThan(0)
    const rates = plan.picks.map((o) => o.hours / o.cost)
    // the first pick is the best value
    expect(rates[0]).toBe(Math.max(...opts.map((o) => o.hours / o.cost)))
  })
  it('equal share gives every ward something', () => {
    const opts = [guard, vendors].flatMap((p) => optionsFor(p, ['cold', 'heat']))
    const plan = suggestPlan(opts, 12000, true)
    expect(new Set(plan.picks.map((o) => o.point.ward))).toEqual(new Set(['A', 'B']))
  })
  it('trees are never bought for the next 30 days', () => {
    expect(HELP.trees.starts).toBe('years')
    expect(optionsFor(vendors, ['heat']).some((o) => o.help === 'trees')).toBe(false)
  })
})

describe('did the help work?', () => {
  const h = demoHistory([{ id: 'shyam-gate', name: 'Raksha Vihar, Gate 2', nameHi: 'रक्षा विहार, गेट 2', lat: 26.2, lon: 78.18 }])
  it("first calls reproduce the worked example: 24 of 40 -> 63% (51-75%) from the file's 90%", () => {
    const L = learn(h.tasks, h.checks)
    expect(L.prior).toBeCloseTo(0.9, 2)
    expect(L.calls.n).toBe(40)
    expect(L.calls.yes).toBe(24)
    expect(L.calls.mean).toBeCloseTo(0.633, 2)
    expect(Math.round(L.calls.lo * 100)).toBe(51)
    expect(Math.round(L.calls.hi * 100)).toBe(75)
  })
  it('night visits correct the self-reports: 8 of 10 held up, so the rate the plan uses drops', () => {
    const L = learn(h.tasks, h.checks)
    expect(L.visits).toEqual({ n: 10, agreed: 8 })
    expect(L.trust).toBeCloseTo(0.8, 5)
    expect(L.adjusted.mean).toBeLessThan(L.calls.mean)
    expect(Math.round(L.adjusted.mean * 100)).toBe(53)
  })
  it('month by month: December 63%, January 48% (a fall is news)', () => {
    const tr = monthlyTrend(h.tasks, h.checks)
    expect(tr.map((m) => m.month)).toEqual(['2025-12', '2026-01'])
    expect(Math.round(tr[0].belief.mean * 100)).toBe(63)
    expect(Math.round(tr[1].belief.mean * 100)).toBe(48)
    expect(tr[1].n).toBe(40)
  })
  it('reasons are counted once per heater, from its newest answer', () => {
    const r = reasonCounts(h.tasks, h.checks)
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(23)
    expect(r.bill_fear).toBe(8)
  })
  it("Shyam's gate: no socket, fixed, yes, bill fear on 27 Dec, flagged before the cold night, yes again", () => {
    const mine = h.checks.filter((c) => c.taskId === 'demo-h0').sort((a, b) => a.at - b.at)
    expect(mine.map((c) => c.ok)).toEqual([false, true, true, false, true, true])
    expect(mine[3].reason).toBe('bill_fear')
    expect(h.events.filter((e) => e.taskId === 'demo-h0').map((e) => e.kind)).toEqual(['fix', 'flag', 'bill_support'])
    expect(h.tasks[0].pointId).toBe('shyam-gate')
  })
  it('Estimated and Confirmed hours are never mixed: confirmed only inside a fresh yes', () => {
    const p = peh(h.tasks, h.checks, at('2025-12-01', 0), at('2026-02-01', 0))
    expect(p.estimated).toBe(60 * 1.5 * 12 * 62)
    expect(p.confirmed).toBeGreaterThan(0)
    expect(p.confirmed + p.failed + p.unknown).toBe(p.estimated)
  })

  const task = (over: Partial<Task> = {}): Task => ({
    id: 't1', pointId: 'p', pointName: 'P', pointNameHi: 'P', lat: 0, lon: 0, help: 'heater', qty: 1, cost: 1200, people: 1,
    shiftHours: 12, status: 'delivered', deliveredAt: at('2026-12-01'), createdAt: 0, updatedAt: 0, ...over,
  })
  const yes = (d: string, id = 'c'): Check => ({ id, taskId: 't1', at: at(d), signal: 'call', ok: true, ranFrom: 21 })
  it('a delivered heater is checked the next day, then a week after the first yes', () => {
    expect(taskState(task(), [], [], at('2026-12-01', 15)).due).toBe(at('2026-12-01') + DAY)
    const s = taskState(task({ status: 'working' }), [yes('2026-12-02')], [], at('2026-12-04'))
    expect(s.status).toBe('fresh')
    expect(s.why).toBe('week')
    expect(s.due).toBe(at('2026-12-09'))
  })
  it('a yes older than a week needs a re-check, and after 3 weeks it is unknown', () => {
    expect(taskState(task({ status: 'working' }), [yes('2026-12-02')], [], at('2026-12-12')).status).toBe('recheck')
    expect(taskState(task({ status: 'working' }), [yes('2026-12-02')], [], at('2026-12-28')).status).toBe('unknown')
  })
  it('a cold night coming makes a 4-day-old yes due now', () => {
    const s = taskState(task({ status: 'working' }), [yes('2026-12-02')], [], at('2026-12-06'), { coldNightAt: at('2026-12-06', 20) })
    expect(s.why).toBe('cold_night')
    expect(s.status).toBe('recheck')
  })
  it('a fire reported after a yes is a contradiction: check now', () => {
    const s = taskState(task({ status: 'working' }), [yes('2026-12-02')], [{ id: 'f', pointId: 'p', at: at('2026-12-03', 23) }], at('2026-12-04'))
    expect(s.contradiction).toBe(true)
    expect(s.why).toBe('fire')
  })
})

describe('planner follows the checks', () => {
  it('before checks a new heater is the best buy; after, warm kits and socket fixes beat it', () => {
    const before = heaterValue(FILE_HEATER_RATE)
    const after = heaterValue(0.53)
    expect(before.heater).toBeGreaterThan(before.warm_kit)
    expect(before.heater).toBeGreaterThan(before.socket_fix)
    expect(after.warm_kit).toBeGreaterThan(after.heater)
    expect(after.socket_fix).toBeGreaterThan(after.heater)
  })
  it('no heater: a heater option; unconfirmed heater: a socket fix, worth more once heaters are known to fail', () => {
    const none: Point = { id: 'g', name: 'G', nameHi: 'जी', lat: 0, lon: 0, type: 'gate', ward: 'A', wardHi: 'ए', people: [{ group: 'guard', count: 1, shift: 'night' }], heater: 'none' }
    const unconf: Point = { ...none, id: 'u', heater: 'unconfirmed' }
    expect(optionsFor(none, ['cold']).some((o) => o.help === 'heater')).toBe(true)
    const fix = (r: number) => optionsFor(unconf, ['cold'], undefined, r).find((o) => o.help === 'socket_fix')!.hours
    expect(fix(0.53)).toBeGreaterThan(fix(0.9))
  })
})

describe('condition screens', () => {
  const hours = (fn: (h: number) => Partial<Hour>) => Array.from({ length: 24 }, (_, h) => hour(h, fn(h)))
  it('mild, warm, very hot', () => {
    expect(conditionOf(day()).cond).toBe('mild')
    expect(conditionOf(day({}, hours((h) => ({ feels: h >= 12 && h < 16 ? 34 : 26 })))).cond).toBe('warm')
    const hot = day({}, hours((h) => ({ feels: h >= 12 && h < 16 ? 44 : 30 })))
    expect(conditionOf(hot).cond).toBe('hot')
    expect(heatSpan(hot, 2)).toEqual({ from: 12, to: 16 })
  })
  it('cold night with the risky hours across midnight', () => {
    const d = day({}, hours((h) => ({ feels: h >= 22 ? 4 : 18 })))
    const nx = day({ date: '2026-09-27' }, hours((h) => ({ feels: h < 6 ? 3 : 18 })))
    expect(conditionOf(d, nx).cond).toBe('cold')
    expect(coldSpan(d, nx)).toEqual({ from: 22, to: 6 })
  })
  it('Delhi, 25 Dec 2024: a smoggy cold night is an air screen (air wins the tie), with cold as "also"', () => {
    const d = day({ aqi: 298 }, hours((h) => ({ feels: h >= 20 || h < 8 ? 9.4 : 18, aqi: h >= 18 ? 331 : 260 })))
    const c = conditionOf(d)
    expect(c.cond).toBe('air')
    expect(c.also).toEqual(['cold'])
    expect(worstAirSpan(d)?.from).toBe(18)
  })
  it('rain likely (60% chance or 5 mm) is its own screen, below heat, air and cold, above warm and mild', () => {
    const wet = day({ rainProbMax: 96, rainSum: 35 }, hours((h) => ({ feels: 26, rainProb: h >= 14 && h < 20 ? 90 : 20 })))
    expect(conditionOf(wet).cond).toBe('rain')
    const warmWet = day({ rainProbMax: 70, rainSum: 3 }, hours((h) => ({ feels: h >= 12 && h < 16 ? 34 : 27 })))
    expect(conditionOf(warmWet)).toMatchObject({ cond: 'rain', also: ['heat'] })
    const coldWet = day({ rainProbMax: 80, rainSum: 8 }, hours((h) => ({ feels: h >= 20 || h < 8 ? 4 : 14 })))
    expect(conditionOf(coldWet)).toMatchObject({ cond: 'cold', also: ['rain'] })
  })
  it('heat and bad air together are Double risk', () => {
    expect(conditionOf(day({ aqi: 268 }, hours((h) => ({ feels: h >= 12 && h < 17 ? 43.7 : 33 })))).cond).toBe('double')
  })
  it('dust or smoke: PM2.5 under half of PM10 means dust', () => {
    expect(airProblem(60, 250)).toBe('dust')
    expect(airProblem(160, 180)).toBe('smoke')
  })
  it('planting season: plains July-September, Leh March-May', () => {
    expect(plantingNow(9, climateOf(200, 'gwalior'))).toBe(true)
    expect(plantingNow(9, climateOf(3500, 'leh'))).toBe(false)
    expect(plantingNow(4, 'cold_desert')).toBe(true)
    expect(plantingNow(3, 'cold_desert')).toBe(true)
    expect(plantingNow(3, 'plains')).toBe(false)
  })
})

describe('fire risk tonight and Resilience Debt', () => {
  const coldStill = { feelsMin: 2, windMean: 3 }
  it('a priority score with visible parts: cold, still air, people, no working heater', () => {
    const none = burningRisk(coldStill, { personHours: 12, heater: 'none', heaterRate: 0.9 })
    expect(none.level).toBe('high')
    expect(none.parts.cold).toBe(1)
    const working = burningRisk(coldStill, { personHours: 12, heater: 'working', heaterRate: 0.9 })
    expect(working.score).toBeLessThan(none.score)
    expect(burningRisk({ feelsMin: 20, windMean: 3 }, { personHours: 300, heater: 'none', heaterRate: 0.9 }).score).toBe(0)
  })
  it('learning that heaters fail raises the risk where a heater was only handed out', () => {
    const at90 = burningRisk(coldStill, { personHours: 12, heater: 'unconfirmed', heaterRate: 0.9 }).score
    const at53 = burningRisk(coldStill, { personHours: 12, heater: 'unconfirmed', heaterRate: 0.53 }).score
    expect(at53).toBeGreaterThan(at90)
  })
  it('debt: high danger and no protection first', () => {
    const p: Point = { id: 'm', name: 'M', nameHi: 'एम', lat: 0, lon: 0, type: 'market', ward: 'A', wardHi: 'ए', people: [{ group: 'vendor', count: 30, shift: 'day' }] }
    const hz = { heat: true, cold: false, air: false }
    const bare = protectionOf(p, hz, { heaterRate: 0.9, confirmed: new Set() })
    const shaded = protectionOf({ ...p, offers: ['shade', 'water'] }, hz, { heaterRate: 0.9, confirmed: new Set() })
    expect(bare.share).toBe(0)
    expect(shaded.share).toBe(1)
    expect(resilienceDebt(50, 50, bare.share)).toBe(100)
    expect(resilienceDebt(50, 50, shaded.share)).toBe(20)
  })
  it('a point only gets a fire score when someone is out on a cold night', () => {
    const guard: Point = { id: 'a', name: 'A', nameHi: 'ए', lat: 0, lon: 0, type: 'atm', ward: 'A', wardHi: 'ए', people: [{ group: 'guard', count: 1, shift: 'night' }], heater: 'none' }
    expect(pointRisk(guard, day(), undefined, ['mild']).burning).toBeNull()
    const cold = day({}, Array.from({ length: 24 }, (_, h) => hour(h, { feels: 3, wind: 3 })))
    expect(pointRisk(guard, cold, undefined, ['cold']).fire).toBe('high')
  })
})

describe('live data parsing', () => {
  it('groups hours into days with Indian AQI from the daily mean', () => {
    const time = Array.from({ length: 48 }, (_, i) => `${i < 24 ? '2026-09-26' : '2026-09-27'}T${String(i % 24).padStart(2, '0')}:00`)
    const days = buildDays(
      {
        time,
        temperature_2m: time.map(() => 26), apparent_temperature: time.map((_, i) => 20 + (i % 24)), relative_humidity_2m: time.map(() => 60),
        precipitation_probability: time.map(() => 10), precipitation: time.map(() => 0), wind_speed_10m: time.map(() => 5), weather_code: time.map(() => 3),
      },
      { time, pm2_5: time.map(() => 45), pm10: time.map(() => 60) },
      ['2026-09-26', '2026-09-27'],
    )
    expect(days).toHaveLength(2)
    expect(days[0].hours).toHaveLength(24)
    expect(days[0].fmax).toBe(43)
    expect(days[0].aqi).toBe(indianAqi(45, 60))
    expect(days[0].code).toBe(3)
    expect(dayLevel(days[0])).toBe(3)
  })
})

describe('dates in IST', () => {
  it('today follows Asia/Kolkata, not the device', () => {
    // 20:00 UTC on 25 Sep is 01:30 IST on 26 Sep
    expect(istToday(new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-26')
    expect(clockDate(new Date('2026-09-26T05:12:00Z'), 'en')).toBe('Saturday, 26 September')
    expect(hourLabel(16, 'en')).toBe('4 pm')
  })
})

describe('Hindi and English have the same words', () => {
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
    walk(UI.en, UI.hi, 'ui', out)
    expect(out).toEqual([])
  })
  it('Hindi is in Devanagari', () => {
    expect(UI.hi.level.every((s) => /[ऀ-ॿ]/.test(s))).toBe(true)
    expect(UI.hi.today.title).toMatch(/[ऀ-ॿ]/)
  })
})

describe('bad input never reaches the screens', () => {
  it('coordinates must be real', () => {
    expect(validLatLon(26.2, 78.1)).toBe(true)
    expect(validLatLon(95, 500)).toBe(false)
    expect(validLatLon(NaN, 10)).toBe(false)
    expect(validLatLon('26', 78)).toBe(false)
  })
  it('damaged saved tasks and checks are dropped, good ones kept', () => {
    const good = { id: 'a', help: 'heater', status: 'delivered', qty: 1, people: 1, createdAt: 1, updatedAt: 1, deliveredAt: 2 }
    const db = sanitizeDb({
      tasks: [good, { id: 'x', help: 'heater', status: 'delivered' }, null, 'oops'],
      checks: [{ taskId: 'a', at: 5, ok: true }, { taskId: 'a', at: 'bad', ok: true }],
      fires: 'nope',
    })
    expect(db.tasks.map((t) => t.id)).toEqual(['a'])
    expect(db.checks).toHaveLength(1)
    expect(db.fires).toEqual([])
    expect(sanitizeDb('{bad').tasks).toEqual([])
  })
})

describe('full CPCB AQI with gases', () => {
  it('uses the CPCB gas bands (O3 8-hour, NO2, SO2, CO in mg/m³)', () => {
    expect(aqiParts(null, null, { o3: 65 }).o3).toBeCloseTo(65, 0)
    expect(Math.round(aqiParts(null, null, { no2: 100 }).no2!)).toBe(120)
    expect(Math.round(aqiParts(null, null, { co: 1500 }).co!)).toBe(73)
    expect(Math.round(aqiParts(null, null, { so2: 60 }).so2!)).toBe(75)
  })
  it('a clean-PM day with ozone reads as ozone, not "Good 5"', () => {
    expect(indianAqi(3, 5)).toBe(5)
    expect(indianAqi(3, 5, { o3: 65, no2: 10 })).toBe(65)
    expect(mainPollutant(aqiParts(3, 5, { o3: 65 }))).toBe('o3')
  })
  it('without particulate matter there is no AQI (CPCB needs PM)', () => {
    expect(indianAqi(null, null, { o3: 80 })).toBeNull()
  })
  it('GRAP stages follow CAQM thresholds; NCR box covers Delhi, not Gwalior', () => {
    expect([150, 250, 350, 420, 460].map(grapStage)).toEqual([null, 1, 2, 3, 4])
    expect(inNcr(28.63, 77.22)).toBe(true)
    expect(inNcr(26.18, 78.14)).toBe(false)
  })
})
