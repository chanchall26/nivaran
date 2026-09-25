# Barahmasa · बारहमासा

**Shade in summer, warmth in winter. · गर्मी में छाया, सर्दी में गरमाहट**

A year-round safety app for people who work outdoors in Indian cities: night guards, street vendors, construction workers, traffic police, delivery riders and homeless people. It tells a city officer **who will face heat, cold, rain or bad air today, what help they need, and whether the help actually worked.**

Live: **https://barahmasa-gwalior.web.app** · Pilot: Gwalior (Shinde Ki Chhawani, 474001), Delhi (Connaught Place) and Leh. Any other Indian place gets weather, air, season and map points from OpenStreetMap.

## What you can do

| Who | Screens |
|---|---|
| **Officer** (Nagar Nigam, Commissioner) | Today (condition banner, 24-hour danger strip, next 5 days, map with a Fire risk tonight layer, who needs help by Resilience Debt, Air panel, Shade Clock on hot days, same place in both seasons), Map, Needs, Schemes (budget → best plan → apply, and what the checks changed), Did the help work?, Protected hours, Where to plant, Reports (monthly and CSR), Alerts |
| **Partner** (RWA, NGO, CSR, security agency) | My tasks: check before handing over (socket, bill permission, night guard), mark as delivered, call to check (Hindi question "what time did it run?", answers from a call, a night visit or a smart plug, reason from a fixed list), checks due, report a fire; Reports |
| **Worker or citizen** (no login, no name) | Today's risk in one big panel, your shift, help near me, ask for help, read aloud |

Every role has **Try demo**. Every number carries an honest label: **Live**, **Saved forecast** (with its time), **Estimated**, **Demo data** or **Real past day**.

**The screen follows the day.** Mild (green), Hot afternoon (yellow), Very hot (red), Bad air (smoke grey, Air panel first), Cold night (blue, night shift and fire layer first), Double risk (heat + bad air, split banner). Each banner says when it is dangerous and what to do now.

**See another day** (sidebar), all real archive weather and air: Delhi 25 Dec 2024 (smoky night), Gwalior's hottest day of 2026, Delhi 19 Jun 2024 (heat and bad air together), Gwalior's coldest night of January 2026.

Shareable views: `?pin=474001`, `?lat=..&lon=..`, `?date=YYYY-MM-DD` (any day inside the forecast range), `?replay=smog|summer|double|winter`.

## Simple demo rules

- **Danger per hour** (worse of heat and cold, by feels-like): heat <32 Safe, 32–38 Be careful, 38–43 Get ready, ≥43 Act now; cold ≥15 Safe, 10–15 Be careful, 5–10 Get ready, <5 Act now. Indian AQI 201–300 means at least Get ready; 301+ means Act now. Night hours count double for night-shift points.
- **Today's mode** from the forecast (at most two): Cold night (lowest feels-like ≤10°), Heat (highest feels-like ≥40° or temperature ≥38°), Humid heat (≥32° and afternoon humidity ≥60%), Rain (chance ≥60% or ≥5 mm), Smoky air (AQI ≥201), else Mild with a 5-day trend.
- **Screen (condition)**: Double risk when heat and air are both Get ready or worse; otherwise the worst of air (24-hour AQI), cold night (18:00–09:00) and heat, with air winning a tie; heat at Be careful gives Hot afternoon.
- **Fire risk tonight** (Survival Burning Risk, a priority score 0–100, not a probability): cold (feels-like 16° → 0, 4° → 1) × still air (wind 12 km/h → 0, 2 km/h → 1) × people out at night × no working heater (a handed-out heater counts as the share that really run) + fire reports. 50+ High, 25+ Medium. Every part is shown.
- **Where to plant**: score = heat need on last summer's hottest day (more where there is no shade now) + air need (traffic) + people who stay. Narrow busy lane → low dense hedge under 2 m; open busy road → hedge by the road and trees behind; open place → shade trees (Neem, Peepal, Jamun, Arjun); Leh → windbreak rows, planted in spring. Before/After as ranges: shade 4–8° cooler in the sunny hours, a hedge 10–25% less PM10 behind it.
- **Resilience Debt**: today's danger at a point (relative to the worst point) × (1 − 0.8 × protection it has for today's hazards). The "who needs help" list is sorted by it.
- **Indian AQI** from PM2.5 / PM10 with CPCB breakpoints (the higher sub-index).
- **Schemes**: greedy by protected person-hours per rupee over 30 days; "Equal share" first gives each ward a slice. Trees are listed but not bought (they help only after ~3 years).
- **Did the help work?** Beta-Binomial learning on the first answer for each heater: assumed 90% before checks, 63% (51–75%) after 40 calls. Night visits test self-reported yeses (8 of 10 held up, so each counts 0.8): 53%, which the planner uses. Month by month: December 63%, January 48%.
- **A "yes" expires**: it counts as confirmed for 7 days; checks the day after delivery, a week after the first yes, then every 2 weeks (a random 1 in 4 once help works 9 in 10); before a cold night anything older than 3 days is checked again; after 3 weeks it is unknown; a fire reported at a "working" heater means check now.
- **Protected hours**: Estimated counts every item handed out every night; Confirmed counts only nights inside a fresh yes. They are never mixed.
- **Planner follows the checks**: heaters are valued at the learned rate, so a new heater (243 → 142 protected hours per ₹1,000) drops below a socket + bill-permission fix (32 → 153) and a warm kit (225).

## Data (all free, no keys)

| What | Source |
|---|---|
| Forecast, 7 days hourly | Open-Meteo forecast API |
| Air | Open-Meteo air quality (CAMS), shown as Indian AQI, labelled "Model estimate" |
| Real past days | Open-Meteo historical archive and air-quality archive |
| Shade Clock | Google Open Buildings footprints and heights, ESA WorldCover trees (`web/public/data/gwalior/nodes.json`), sun position from suncalc |
| Place names | Open-Meteo geocoding, BigDataCloud reverse geocoding |
| PIN codes | `web/public/data/pins.json` (India Post directory) with api.postalpincode.in as fallback |
| Map points | Curated pilot points anchored to real OpenStreetMap places (`web/public/data/points/`); Overpass within 2 km for any other place. People counts are estimates |
| Map tiles | © OpenStreetMap contributors, © CARTO |

Every response is cached for 30 minutes; after 8 s the app falls back to the last saved copy and says when it was saved. The app installs as a PWA and opens offline.

## Run it

```bash
cd web
npm install
npm run dev     # http://localhost:5173
npm test        # danger rules, AQI, modes, planner, learning, i18n parity, engine tests
```

Firebase is only needed for the optional **Continue with Google** (Officer / Partner). Enable the Google provider under Authentication and add your domain to Authorized domains. The demo never depends on it.

Deploys run on every push to `main` (`.github/workflows/deploy.yml`: test → build → Firebase Hosting).

## Repo layout

```
web/src/lib/       risk (rules, conditions, fire risk), live (weather + air + cache + real past days), place (GPS, search, PIN),
                   points (debt, protection), plan, tasks (tasks, checks, fire reports), checks (expiry, schedule, learning,
                   protected hours, demo history), plant (where to plant, what, before/after), shade (Shade Clock), ist
web/src/screens/   Entry, Today, Schemes, Tasks, Worker, Plant, Report, Misc (map, needs, checks, hours, alerts, settings, sources)
web/src/ui/        StationBoard, Header, PlacePicker, Nav, DayStrip, PointsMap, Condition, AirPanel, ShadeClock
web/src/i18n/ui.ts every word in easy English and Hindi
pipeline/          Python builders for city data, pilot points and PINs
```

## Honest limitations

- Weather and air come from models at one point; street-level extremes can be 2–3 °C worse. Air is a model estimate, not a ground monitor.
- People counts at points are estimates. Help costs and last winter's heater programme (60 heaters, its calls, visits and fixes) are demo data.
- No system can check every heater every night, and it should not: that would be watching the guards. The numbers are a close, honest estimate with a range.
- Tasks, checks and help requests are saved on the device in this version; a shared backend is the next step.
