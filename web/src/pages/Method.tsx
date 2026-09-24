import { Card } from '../components/ui'
import { aiMode } from '../lib/ai'
import { heaterMonthlyCost } from '../lib/policy'
import { store } from '../lib/store'
import { useApp } from '../state'

export default function Method() {
  const { city } = useApp()
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Method, data aur seemayein</h1>
        <p className="mt-1 text-ink-2">
          Har number kahan se aaya, kaunsa naapa gaya aur kaunsa andaaza hai. Koi black box nahi.
        </p>
      </div>

      <Card title="Scores (0-100, kam = zyada zaroorat)">
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold">Bahar-Log exposure (0-1)</h3>
            <code className="mt-1 block rounded bg-paper p-2 text-xs">
              0.45 × aabaadi/p95 + 0.35 × mapped bahar-log/p95 + 0.20 × main sadak km/p95
            </code>
          </div>
          <div>
            <h3 className="font-semibold">Chhaya Score (garmi)</h3>
            <code className="mt-1 block rounded bg-paper p-2 text-xs">
              need = (0.5 × canopy gap + 0.5 × surface garmi) × (0.3 + 0.7 × exposure) × (0.4 + 0.6 × aaj ki garmi)
            </code>
            <p className="mt-1 text-ink-2">
              Log multiplier hain, jod nahi: khaali garam maidan plantation ka mauka hai, emergency nahi. Canopy gap 30% lakshya se (3-30-300 rule). Surface garmi city ke 5th-95th percentile LST pe. Aaj ki garmi: feels-like
              32°C pe 0, 46°C pe 1.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Alaav Score (sardi)</h3>
            <code className="mt-1 block rounded bg-paper p-2 text-xs">
              need = exposure × (0.65 + 0.35 × rain-basera doori) × raat ki thand × (0.75 + 0.25 × Smoke-Trap)
            </code>
            <p className="mt-1 text-ink-2">
              Raat ki thand: raat ka minimum feels-like 16°C pe 0, 4°C pe 1. Garam raat pe poore shehar ka score 100 ho jaata hai,
              jaan-boojh ke.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Smoke-Trap Index</h3>
            <code className="mt-1 block rounded bg-paper p-2 text-xs">
              ventilation coefficient = boundary layer height (m) × hawa (m/s), raat 20:00-07:00 ka median · ≥1500 m²/s → 0,
              ≤100 m²/s → 1
            </code>
            <p className="mt-1 text-ink-2">
              5-6 Jan 2026 ki raat Gwalior mein ye ~5 m²/s tha (boundary layer 10-20 m, hawa &lt;0.6 m/s): jo bhi aag jali, uska
              dhuan saans ki oonchaai pe phansa raha.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Match priority</h3>
            <code className="mt-1 block rounded bg-paper p-2 text-xs">
              har unit → max[(need + 0.15 × min(1, khuli reports/3)) × naye cover hone wale log]
            </code>
            <p className="mt-1 text-ink-2">
              Product nahi, sum: zero reports wali jagah zero nahi hoti. Reports ka weight chhota hai taaki jin ilaakon mein
              smartphone kam hain, woh peeche na chhootein. All-Season Cabin garmi aur sardi zaroorat ke geometric mean pe jaata hai.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Data sources">
        <ul className="space-y-2 text-sm">
          {city &&
            Object.entries(city.meta.layers).map(([k, v]) => (
              <li key={k}>
                <b className="capitalize">{k}:</b> <span className="text-ink-2">{v}</span>
              </li>
            ))}
          <li>
            <b>Weather:</b> <span className="text-ink-2">Open-Meteo forecast + historical forecast (ERA5-based) + CAMS PM2.5. Ek hi point pura shehar; spatial farq structural layers se aata hai.</span>
          </li>
          <li>
            <b>Grid:</b> <span className="text-ink-2">H3 resolution 9 (~0.1 km²), {city?.meta.cells ?? '…'} cells. Ward boundaries public nahi thin.</span>
          </li>
        </ul>
      </Card>

      <Card title="Privacy aur dignity">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Chehre aur logon ka upar ka hissa <b className="text-ink">phone pe hi</b> blur (MediaPipe). Asli photo upload nahi hoti; EXIF hat jaata hai.</li>
          <li>Face model fail ho toh poori photo blur (fail-safe).</li>
          <li>Public map pe location ~100 m tak round. Beghar logon ki exact jagah kabhi public nahi.</li>
          <li>Gemini ko instruction: insaan ki pehchaan, jaati, dharm ya roop ke baare mein kuch nahi.</li>
          <li><b className="text-ink">Madad, challan nahi:</b> jahan log hain, woh report sirf madad ki taraf. Sirf bina insaan wala kachra dher Nagar Nigam ko, woh bhi uthane ke liye.</li>
          <li>DPDP Act 2023 ki bhavna: data minimisation, purpose limitation.</li>
        </ul>
      </Card>

      <Card title="Seemayein (honestly)">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>OSM mein Gwalior kam mapped hai (sirf 3 bus stops). Isliye kuch guard posts, rehri zones aur beghar spots <b className="text-ink">synthetic</b> hain, aabaadi ke hisaab se rakhe gaye. Map pe har point ka source dikhta hai.</li>
          <li>Rain basera locations demo hain; Nagar Nigam list se badalni hongi.</li>
          <li>Weather model data hai, station nahi; IMD station pe extremes 2-3°C zyada ho sakte hain.</li>
          <li>Weights expert judgement hain, abhi field data se calibrate nahi hue. Pilot ke Pulse data se inhe seekhna hai.</li>
          <li>Heater running cost example: 800 W × 6 h × 30 raat ≈ ₹{heaterMonthlyCost()}/mahina (₹7/kWh).</li>
        </ul>
      </Card>

      <p className="text-center text-xs text-ink-3">
        AI: {aiMode()} · Storage: {store.mode}
      </p>
    </div>
  )
}
