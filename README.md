# Barahmasa · बारहमासा

**Garmi mein chhaya, sardi mein garmahat.** A year-round (12-month) thermal-safety and clean-air platform for people who work or live outdoors: security guards, street vendors, labourers, delivery workers and homeless people. Pilot city: **Gwalior, Madhya Pradesh**.

> Wahi guard jo December mein thand se bachne ke liye kachra jalata hai, wahi May mein 45°C mein bina chhaaya ke khada rehta hai. Log wahi, jagah wahi, bas mausam ulta.

Theme: **Clean Air & Climate Resilience** (GDG hackathon).

## What it does

| Feature | What you see | Where |
|---|---|---|
| **Bahar-Log Map** | 1,376 H3 cells (~0.1 km² each) over Gwalior, scored for heat (Chhaya Score) or cold (Alaav Score), plus the places where people are outdoors for hours | `/map` |
| **Season switch** | One button flips the whole city between summer and winter; same engine, same people, opposite weather | header |
| **Live / Replay / Planning weather** | Today's Open-Meteo forecast, the worst night of winter 2025-26 or the worst day of summer 2026, or a typical January night / May afternoon | map panel |
| **Smoke-Trap Index** | Night ventilation coefficient (boundary-layer height × wind). 5-6 Jan 2026 in Gwalior: ~5 m²/s, so smoke from any warming fire stayed at breathing height | map panel |
| **Madad, Challan Nahi** | Photo report. Faces and upper bodies are blurred **on the phone** (MediaPipe), then Gemini classifies the situation and routes it to help. A report about people can never be routed to enforcement | `/report` |
| **Barahmasa Match** | Allocates heaters, warm kits, shade nets, water points, saplings and all-season guard cabins by need × people, with a written reason for each choice and a comparison against "first come, first served" | `/match` |
| **Pulse Check** | Hindi voice check-in ("Kal raat heater chala?"). A "no" gets a reason (bijli bill, RWA refused, broken…) and each reason gets its own fix | `/pulse` |
| **Impact Ledger** | Heater active rate, sapling survival, report-to-help time, reasons help failed, and modelled estimates shown as ranges with their assumptions. One-click CSR PDF | `/ledger` |
| **Method** | Every formula, source and limitation | `/method` |

## Google tech used

- **Gemini** through **Firebase AI Logic** (client SDK, Gemini Developer API): photo understanding with structured JSON output, and understanding Hindi/Hinglish Pulse answers
- **Firebase**: Hosting, Firestore (real-time: a report sent from a phone appears on the coordinator's map immediately), Anonymous Auth, security rules that enforce the no-enforcement policy
- **MediaPipe Tasks** (face detector + object detector): on-device privacy blurring
- **Google Maps Platform** basemap when a key is configured (falls back to MapLibre + OpenFreeMap)

## Run it locally

```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm test             # scoring, allocation, policy and ledger tests on the real Gwalior data
```

With no configuration, or if anonymous sign-in fails, the app runs in **demo mode**: data is kept in the browser, AI falls back to transparent rules, and the basemap is OpenFreeMap. On the Impact page, **Demo season load karo** fills in a simulated winter and summer. It uses the real Match engine plus simulated Pulse answers, every row is flagged `demo`, and one click removes them.

### Turning on Firebase and Gemini

1. Create a Firebase project (the free Spark plan is enough) and add a **Web app**.
2. **Authentication → Sign-in method →** enable **Anonymous**.
3. **Firestore Database →** create (production mode, region `asia-south1`).
4. **AI Logic →** get started with the **Gemini Developer API**. AI Logic now requires **App Check**: create a reCAPTCHA Enterprise key for your domains, register it under App Check for the web app, and enforce App Check for AI Logic. For `npm run dev`, register a debug token and put it in `web/.env.development.local` as `VITE_APPCHECK_DEBUG_TOKEN` (never in `.env.local`, which is also used by production builds).
5. `cp web/.env.example web/.env.local` and fill in the `VITE_FIREBASE_*` values and `VITE_RECAPTCHA_SITE_KEY`. Optionally set `VITE_GOOGLE_MAPS_API_KEY`.
6. Deploy:

```bash
firebase login --reauth
firebase use --add            # pick the project
cd web && npm run build && cd ..
firebase deploy --only hosting,firestore
```

## Data pipeline (`pipeline/`)

Static city data is built once and committed under `web/public/data/gwalior/`.

```bash
pip install -r pipeline/requirements.txt
sh pipeline/run_all.sh
```

| Layer | Source | Notes |
|---|---|---|
| City boundary, bus stops, markets, guarded sites (banks, ATMs, hospitals, schools), roads, localities | OpenStreetMap (Overpass) | Gwalior is thinly mapped: only 3 bus stops |
| Tree canopy | ESA WorldCover 2021, 10 m | tree-cover class share per cell |
| Surface temperature | Landsat 8/9 C2 L2, median of 10, 18, 25 and 26 May 2026 | via Microsoft Planetary Computer |
| Population | Meta High Resolution Settlement Layer, ~30 m | 9.4 lakh inside city limits |
| Weather | Open-Meteo forecast, historical forecast, CAMS PM2.5 | one point for the whole city |

**Synthetic data, clearly labelled.** Because OSM is thin, some guard posts, rehri zones, worksites, homeless spots and labour chowks are sampled in proportion to population. Night-shelter locations are placeholders. Every map point shows its source (`OSM`, `synthetic` or `demo`).

## Scores

All scores run from 0 to 100, and a **lower score means more need**.

- **Exposure** = 0.45 · population + 0.35 · mapped outdoor people + 0.20 · main-road length (each scaled by its city 95th percentile)
- **Chhaya** need = (0.5 · canopy gap + 0.5 · surface heat) × (0.3 + 0.7 · exposure) × (0.4 + 0.6 · day heat)
- **Alaav** need = exposure × (0.65 + 0.35 · shelter distance) × night cold × (0.75 + 0.25 · Smoke-Trap)
- **Match** gives each unit to the place with the highest (need + 0.15 · min(1, open reports / 3)) × newly covered people

People are a multiplier: an empty, hot field is a planting opportunity, not an emergency. Reports carry little weight so that areas with fewer smartphones are not pushed down the list. Both properties are covered by tests.

## 3-minute demo

| Time | Show |
|---|---|
| 0:00 | Home: Shyam in December and in May. |
| 0:30 | Map → **Sardi** → **Replay**: the 5-6 Jan 2026 smoke-trap night. Top-need list, then click a cell to see how its score is built. |
| 1:10 | Phone: **Report** a guard's fire. Show the on-device blur, Gemini's classification, and the route "RWA ko heater request". It appears live on the laptop map. |
| 1:50 | **Pulse**: "Nahi, RWA bolti hai bijli ka bill zyada aayega" → reason → bill calculator (~₹1,000/month). |
| 2:20 | Press **Garmi**: the same map flips to heat. **Match** the All-Season Cabin, then show the "3× more need-weighted reach than first come". |
| 2:45 | **Impact** → CSR PDF. Closing line. |

## Honest limitations

- Weights are expert judgement and not yet calibrated. A pilot's Pulse data is what should tune them.
- Weather comes from a model at one point. IMD station extremes can be 2-3 °C more severe.
- The browser voice flow stands in for an IVR / missed-call line (Exotel or Twilio) in a real deployment.
- Anonymous auth means Firestore rules check the shape of data, not roles. A coordinator role (custom claims) is the next step.

## Repo layout

```
pipeline/           Python: OSM, WorldCover, Landsat, HRSL, weather → web/public/data
web/                React + Vite + Tailwind + deck.gl app
  src/lib/          scoring, match, policy, impact, weather, ai (Gemini), privacy (MediaPipe), store (Firestore/local)
  src/pages/        Home, MapPage, Report, Match, Pulse, Ledger, Method
firestore.rules     validation + "madad, challan nahi" enforced server-side
firebase.json       Hosting + Firestore
```
