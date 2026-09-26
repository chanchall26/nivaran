# Nivaran · निवारण

**Find the source. Stop the smoke. · स्रोत पकड़ो, धुआं रोको।**

An AI-powered pollution investigation platform for Indian cities. It combines citizen photos, ground sensors (CPCB), satellite fire data (NASA FIRMS) and wind direction to find **hidden pollution hotspots** — industrial smoke, crop burning, waste burning, construction dust — explain *why* it thinks so, forecast where the spike will travel next, and alert the right authority before it gets worse.

> **Status: mid-rebuild.** This repo shipped earlier as **Barahmasa**, a heat/cold safety app for outdoor workers. We are turning it into Nivaran for a Clean Air & Climate Resilience hackathon track. The old heat/cold features (schemes, protected hours, where-to-plant, Shade Clock) are still live in the app and still work — the new pollution features are being added alongside them, not instead of them, until the pivot is complete. See `IMPLEMENTATION_PLAN.md` for the full target design (some of it, like real inter-state agents, is roadmap, not built yet — see "What's real vs simulated" below).

Live: **https://barahmasa-gwalior.web.app** *(Firebase project is still named `barahmasa-gwalior`; will move as part of the rename)*. Pilot: Gwalior (474001), with any Indian place supported via PIN/GPS.

## What you can do

**Pollution investigation (new, Nivaran)**

| Screen | What it does |
|---|---|
| Home | The day's pollution picture: hotspot severity, forecast, alerts — merged with the existing heat/cold condition banner |
| Hotspot Lab | See a hotspot's confidence score broken into its signals: wind direction match, PM2.5 ratio vs background, satellite fire proximity (FIRMS), Gemini photo read |
| Report Pollution / Quick Report | Citizens submit a photo or a quick note about smoke, burning or dust; Gemini reads the photo and drafts an alert |
| Pollution Alerts | Alerts once a hotspot's confidence crosses a threshold |
| Federated Network | A demo "agent feed" showing how zones would share hotspot signals without sharing raw data — see note below, this part is simulated |

**Heat/cold worker safety (original, Barahmasa — still live)**

| Who | Screens |
|---|---|
| **Officer** (Nagar Nigam, Commissioner) | Today (condition banner, 24-hour danger strip, next 5 days, map, who needs help by Resilience Debt, Air panel, Shade Clock on hot days), Map, Needs, Schemes (budget → best plan → apply), Did the help work?, Protected hours, Where to plant, Reports, Alerts |
| **Partner** (RWA, NGO, CSR, security agency) | My tasks: check before handing over, mark as delivered, call to check, checks due, report a fire; Reports |
| **Worker or citizen** (no login, no name) | Today's risk in one big panel, your shift, help near me, ask for help, read aloud |

Every role has **Try demo**. Every number carries an honest label: **Live**, **Saved forecast** (with its time), **Estimated**, **Demo data** or **Real past day**.

Shareable views: `?pin=474001`, `?lat=..&lon=..`, `?date=YYYY-MM-DD` (any day inside the forecast range), `?replay=smog|summer|double|winter`.

## How hotspot confidence works

Each hotspot gets a 0–100 confidence score built from up to four signals, and the app always shows the breakdown, not just the number:

- **Wind match** — does the smoke direction from a photo/report line up with wind blowing from a plausible source?
- **PM2.5 ratio** — how far the nearest CPCB station reading is above the area's normal background
- **Satellite fire proximity** — a NASA FIRMS fire detection near the reported point
- **Gemini photo confidence** — how confident the vision model is that the photo shows the claimed source type (crop burning, brick kiln, garbage burning, industrial smoke, vehicle exhaust, construction dust)

Any signal that hasn't been checked yet is shown as "not checked", never faked as a zero or a "no".

## What's real vs simulated

| Piece | Status |
|---|---|
| Gemini photo analysis & alert drafting (`analyzePhoto`, `draftAlert`, Firebase Functions) | Real, deployed |
| NASA FIRMS fire lookup, OpenAQ/CPCB PM2.5 lookup | Real |
| Hotspot confidence scoring (wind + PM ratio + FIRMS + Gemini) | Real logic, running on real inputs where available |
| BigQuery `AI.FORECAST` on CPCB station PM2.5 history | Real pipeline (`pipeline/bq_forecast.sql`, `web/src/lib/bqForecast.ts`) |
| Federated learning across zones/states | **Simulated.** Plays back canned JSON messages between 3 demo zones to show the idea; not real Flower training, no real cross-state agents |
| Per-state ADK agents talking over A2A protocol | **Roadmap only** (`IMPLEMENTATION_PLAN.md`) — UI copy and type names reference it, no runtime exists yet |
| TimesFM 72h forecasting, multilingual voice bulletin/podcast, GRAP automation | **Roadmap only**, not implemented |

## Simple demo rules (heat/cold side, unchanged)

- **Danger per hour** (worse of heat and cold, by feels-like): heat <32 Safe, 32–38 Be careful, 38–43 Get ready, ≥43 Act now; cold ≥15 Safe, 10–15 Be careful, 5–10 Get ready, <5 Act now. Indian AQI 201–300 means at least Get ready; 301+ means Act now. Night hours count double for night-shift points.
- **Today's mode** from the forecast (at most two): Cold night (lowest feels-like ≤10°), Heat (highest feels-like ≥40° or temperature ≥38°), Humid heat (≥32° and afternoon humidity ≥60%), Rain (chance ≥60% or ≥5 mm), Smoky air (AQI ≥201), else Mild with a 5-day trend.
- **Screen (condition)**: Double risk when heat and air are both Get ready or worse; otherwise the worst of air (24-hour AQI), cold night (18:00–09:00) and heat, with air winning a tie; heat at Be careful gives Hot afternoon.
- **Fire risk tonight** (Survival Burning Risk, a priority score 0–100, not a probability): cold × still air × people out at night × no working heater + fire reports. 50+ High, 25+ Medium. Every part is shown.
- **Where to plant**: score = heat need on last summer's hottest day + air need (traffic) + people who stay. Narrow busy lane → low dense hedge under 2 m; open busy road → hedge by the road and trees behind; open place → shade trees; Leh → windbreak rows, planted in spring.
- **Resilience Debt**: today's danger at a point (relative to the worst point) × (1 − 0.8 × protection it has for today's hazards). The "who needs help" list is sorted by it.
- **Indian AQI** from PM2.5 / PM10 with CPCB breakpoints (the higher sub-index).
- **Schemes**: greedy by protected person-hours per rupee over 30 days.
- **Did the help work?** Beta-Binomial learning on the first answer for each heater: assumed 90% before checks, learned rate updates as calls/visits come in.

## Data (mostly free, no keys)

| What | Source |
|---|---|
| Forecast, 7 days hourly | Open-Meteo forecast API |
| Air quality | Open-Meteo air quality (CAMS) shown as Indian AQI, and CPCB station history for BigQuery forecast |
| Real past days | Open-Meteo historical archive and air-quality archive |
| Satellite fire detections | NASA FIRMS |
| Photo classification, alert drafting | Google Gemini (via Firebase Functions) |
| Shade Clock | Google Open Buildings footprints and heights, ESA WorldCover trees, sun position from suncalc |
| Place names | Open-Meteo geocoding, BigDataCloud reverse geocoding |
| PIN codes | `web/public/data/pins.json` (India Post directory) with api.postalpincode.in as fallback |
| Map points | Curated pilot points anchored to real OpenStreetMap places; Overpass within 2 km for any other place |
| Map tiles | © OpenStreetMap contributors, © CARTO |

Every response is cached for 30 minutes; after 8 s the app falls back to the last saved copy and says when it was saved. The app installs as a PWA and opens offline.

## Run it

```bash
cd web
npm install
npm run dev     # http://localhost:5173
npm test        # danger rules, AQI, modes, planner, learning, i18n parity, engine tests
```

Firebase is only needed for the optional **Continue with Google** login and for the Gemini/Functions-backed photo analysis. The demo never depends on it — everything has a "Try demo" path.

Deploys run on every push to `main` (`.github/workflows/deploy.yml`: test → build → Firebase Hosting).

## Repo layout

```
web/src/lib/       risk (rules, conditions, fire risk), live (weather + air + cache + real past days), place (GPS, search, PIN),
                   points (debt, protection), plan, tasks (tasks, checks, fire reports), checks (expiry, schedule, learning,
                   protected hours, demo history), plant (where to plant, what, before/after), shade (Shade Clock), ist,
                   hotspot (hotspot type + severity), fusion (confidence scoring), federation (simulated agent feed), bqForecast
web/src/screens/   Entry, Today, Schemes, Tasks, Worker, Plant, Report, HotspotLab, ReportPollution, QuickReport,
                   PollutionAlerts, FederatedNetwork, Misc (map, needs, checks, hours, alerts, settings, sources)
web/src/ui/        StationBoard, Header, PlacePicker, Nav, DayStrip, PointsMap, Condition, AirPanel, ShadeClock
web/src/i18n/ui.ts every word in easy English and Hindi
functions/src/     Firebase Functions: analyzePhoto (Gemini), draftAlert (Gemini), aggregateHotspot, FIRMS + OpenAQ lookups
pipeline/          Python builders for city data, pilot points, PINs, and the BigQuery forecast SQL
```

## Honest limitations

- Weather and air come from models at one point; street-level extremes can be 2–3 °C worse. Air is a model estimate, not a ground monitor, except where a CPCB station reading is used directly.
- Hotspot confidence uses whatever signals are actually available for a report — if wind, FIRMS or a photo aren't available, that signal is shown as "not checked", never guessed.
- Federated learning across zones is a simulated playback for the demo, not a real distributed training run.
- People counts at points are estimates. Help costs and the heater programme data (calls, visits, fixes) are demo data.
- No system can check every heater or every reported hotspot every night, and it should not: that would be watching the guards. The numbers are a close, honest estimate with a range.
- Tasks, checks and help requests are saved on the device in this version; a shared backend is the next step for that part of the app.
