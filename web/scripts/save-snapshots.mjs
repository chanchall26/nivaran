// Save real API responses as offline forecasts for the pilot cities (Brief 2, section 1).
//
//   node scripts/save-snapshots.mjs            -> 26-28 Sep 2026 (the demo days)
//   node scripts/save-snapshots.mjs 2026-09-27 2026-09-29
//
// Writes public/snapshots/{city}-weather.json, {city}-air.json, {city}-summer.json and
// {city}-summer-day.json (hourly for last summer's hottest day, for the hot-hours what-if).
// Every file is the API response as it came, plus "saved_at" (IST). Nothing is typed in.
import { mkdirSync, writeFileSync } from 'node:fs'

const CITIES = {
  gwalior: { lat: 26.178647, lon: 78.144908, expect: { max: 26, min: 22 } },
  delhi: { lat: 28.6315, lon: 77.2167, expect: { max: 31, min: 23 } },
  leh: { lat: 34.1526, lon: 77.5771, expect: { max: 14, min: 2 } },
}
const [START = '2026-09-26', END = '2026-09-28'] = process.argv.slice(2)
const OUT = new URL('../public/snapshots/', import.meta.url)

const weatherUrl = ({ lat, lon }) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code` +
  `&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,sunrise,sunset` +
  `&timezone=Asia/Kolkata&start_date=${START}&end_date=${END}`
const airUrl = ({ lat, lon }) =>
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm2_5,pm10&timezone=Asia/Kolkata&start_date=${START}&end_date=${END}`
const summerUrl = ({ lat, lon }) =>
  `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2026-05-01&end_date=2026-06-30&daily=temperature_2m_max,apparent_temperature_max&timezone=Asia/Kolkata`
const summerDayUrl = ({ lat, lon }, day) =>
  `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${day}&end_date=${day}` +
  `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&timezone=Asia/Kolkata`

/** "2026-09-25T23:30:00+05:30" */
function istNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+05:30`
}

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.reason ?? `HTTP ${r.status}`)
      return j
    } catch (e) {
      if (i === 2) throw new Error(`${e.message}: ${url}`)
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)))
    }
  }
}

mkdirSync(OUT, { recursive: true })
const savedAt = istNow()
const write = (name, body) => writeFileSync(new URL(name, OUT), JSON.stringify({ saved_at: savedAt, ...body }) + '\n')
let warnings = 0

for (const [city, c] of Object.entries(CITIES)) {
  const [weather, air, summer] = await Promise.all([get(weatherUrl(c)), get(airUrl(c)), get(summerUrl(c))])
  // last summer's hottest day, by the highest feels-like
  const fmax = summer.daily.apparent_temperature_max
  let hot = 0
  fmax.forEach((v, i) => v != null && (fmax[hot] == null || v > fmax[hot]) && (hot = i))
  const hotDay = summer.daily.time[hot]
  const summerDay = await get(summerDayUrl(c, hotDay))

  write(`${city}-weather.json`, weather)
  write(`${city}-air.json`, air)
  write(`${city}-summer.json`, summer)
  write(`${city}-summer-day.json`, summerDay)

  const d = weather.daily
  const first = d.time.indexOf(START)
  const peak = Math.max(...summer.daily.temperature_2m_max.filter((v) => v != null))
  const pm = air.hourly.pm2_5.filter((v) => v != null)
  console.log(
    `${city.padEnd(8)} ${START}: max ${d.temperature_2m_max[first]}°, min ${d.temperature_2m_min[first]}°, feels ${d.apparent_temperature_min[first]}-${d.apparent_temperature_max[first]}°, ` +
      `rain ${d.precipitation_probability_max[first]}% / ${d.precipitation_sum[first]} mm | PM2.5 ${Math.min(...pm)}-${Math.max(...pm)} | ` +
      `summer peak ${peak}°, hottest day ${hotDay} (feels ${fmax[hot]}°)`,
  )
  // Brief 2 sanity check: far from the expected values means the run should be repeated
  const off = Math.max(Math.abs(d.temperature_2m_max[first] - c.expect.max), Math.abs(d.temperature_2m_min[first] - c.expect.min))
  if (off > 5) {
    warnings++
    console.warn(`  ! ${city} is ${off.toFixed(1)}° away from the expected ~${c.expect.max}/${c.expect.min}°. Check the forecast or run again later.`)
  }
}
console.log(`saved_at ${savedAt} -> ${OUT.pathname}${warnings ? ` (${warnings} warning${warnings > 1 ? 's' : ''})` : ''}`)
