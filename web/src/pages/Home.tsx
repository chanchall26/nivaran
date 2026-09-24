import { ArrowRight, Camera, Flame, Map, PhoneCall, Shuffle, Sun } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CityAlert, SeasonSwitch, Stat, WeatherSourcePicker } from '../components/ui'
import { computeLedger } from '../lib/impact'
import { band, score } from '../lib/scoring'
import { useApp } from '../state'

export default function Home() {
  const { city, season, weather, deliveries, pulses, reports } = useApp()

  const stats = useMemo(() => {
    if (!city) return null
    const people = city.places.filter((p) => p.kind !== 'shelter').reduce((s, p) => s + (p.staff ?? 1), 0)
    const withCanopy = city.cells.filter((c) => c.canopy != null)
    const canopy = withCanopy.reduce((s, c) => s + (c.canopy ?? 0) * c.pop, 0) / withCanopy.reduce((s, c) => s + c.pop, 0)
    const hot = city.cells.filter((c) => (c.lst ?? 0) >= 48).length / city.cells.length
    const needy = city.cells.filter((c) => {
      const b = band(score(season, c, city.norms, weather).score)
      return b === 'critical' || b === 'serious'
    }).length
    return { people, canopy, hot, needy }
  }, [city, season, weather])

  const ledger = useMemo(() => computeLedger(deliveries, pulses, reports), [deliveries, pulses, reports])

  return (
    <div className="space-y-12">
      {/* hero */}
      <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--accent-700)]">
            Saal-bhar ki thermal safety · Gwalior pilot
          </p>
          <h1 className="mt-2 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Garmi mein <span className="text-garmi-600">chhaya</span>,<br />
            sardi mein <span className="text-sardi-600">garmahat</span>.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-2">
            Wahi guard jo December mein thand se bachne ke liye kachra jalata hai, May mein 45°C mein bina chhaaya ke khada
            rehta hai. <b className="text-ink">Log wahi, jagah wahi, bas mausam ulta.</b> Barahmasa ek hi map pe dono ka
            jawab hai.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/map"
              className="flex items-center gap-2 rounded-xl bg-ink px-5 py-3 font-semibold text-white hover:bg-ink/90"
            >
              <Map className="size-5" aria-hidden /> Bahar-Log Map kholo
            </Link>
            <Link
              to="/report"
              className="flex items-center gap-2 rounded-xl border border-line bg-white px-5 py-3 font-semibold hover:bg-black/5"
            >
              <Camera className="size-5" aria-hidden /> Report bhejo
            </Link>
          </div>
        </div>

        {/* Shyam, two seasons */}
        <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line">
          <div className="bg-sardi-900 p-5 text-white">
            <Flame className="size-7 text-garmi-300" aria-hidden />
            <div className="mt-3 text-sm uppercase tracking-wide text-sardi-100">December, raat 2 baje</div>
            <p className="mt-1 text-lg font-semibold leading-snug">Shyam gate pe patte aur kachra jala raha hai.</p>
            <p className="mt-2 text-sm text-sardi-100">
              6°C, hawa ruki hui, boundary layer 10 m. Dhuan wahin phansa, colony ke gharon tak.
            </p>
          </div>
          <div className="bg-garmi-50 p-5">
            <Sun className="size-7 text-garmi-600" aria-hidden />
            <div className="mt-3 text-sm uppercase tracking-wide text-garmi-700">May, dopahar 2 baje</div>
            <p className="mt-1 text-lg font-semibold leading-snug">Wahi Shyam, wahi gate, koi chhaaya nahi.</p>
            <p className="mt-2 text-sm text-ink-2">Hawa 44°C, zameen 50°C+. Paudhe lage, par jungle mein, gate pe nahi.</p>
          </div>
          <div className="col-span-2 border-t border-line bg-white px-5 py-3 text-sm text-ink-2">
            Barahmasa: <b className="text-ink">pehchaano</b> log kahan exposed hain → <b className="text-ink">bhejo</b> mausam
            ke hisaab se sahi madad → <b className="text-ink">poochho</b> ki madad chal rahi hai ya nahi.
          </div>
        </div>
      </section>

      {/* live city status */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Gwalior {season === 'sardi' ? 'aaj raat' : 'aaj'}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <SeasonSwitch />
            <WeatherSourcePicker />
          </div>
        </div>
        <div className="mt-3">
          <CityAlert />
        </div>
        {stats && city && (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Aabaadi (city limits)"
              value={`${(city.meta.population / 1e5).toFixed(1)} L`}
              sub="Meta HRSL, 30 m grid"
            />
            <Stat
              label="Mapped bahar-log"
              value={stats.people.toLocaleString('en-IN')}
              sub="guards, rehri, mazdoor, beghar (OSM + synthetic)"
            />
            {season === 'garmi' ? (
              <Stat
                label="Log jahan rehte hain, wahan canopy"
                value={`${Math.round(stats.canopy * 100)}%`}
                sub="lakshya 30% · ESA WorldCover"
                tone="text-garmi-700"
              />
            ) : (
              <Stat
                label="Rain basera"
                value={city.places.filter((p) => p.kind === 'shelter').length}
                sub="demo locations · Nagar Nigam se verify karein"
                tone="text-sardi-700"
              />
            )}
            <Stat
              label="Zyada zaroorat wale hexagon"
              value={stats.needy}
              sub={`${city.meta.cells} mein se · ~0.1 km² har ek`}
              tone={season === 'garmi' ? 'text-garmi-700' : 'text-sardi-700'}
            />
          </div>
        )}
      </section>

      {/* how it works */}
      <section>
        <h2 className="text-2xl font-bold">Ek engine, do mausam</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { Icon: Map, t: 'Bahar-Log Map', d: 'Kahan log ghanton khule mein hain: guard posts, rehri, mazdoor chowk, beghar. Har ~0.1 km² ka score.', to: '/map' },
            { Icon: Camera, t: 'Madad, challan nahi', d: 'Photo bhejo. Chehre phone pe hi blur. Gemini batata hai kis madad ki zaroorat hai. Insaan wale case kabhi challan nahi.', to: '/report' },
            { Icon: Shuffle, t: 'Barahmasa Match', d: 'Heater, kambal, shade net, paudhe: jahan zaroorat x log sabse zyada, wahan pehle. Har faisle ki wajah likhi.', to: '/match' },
            { Icon: PhoneCall, t: 'Pulse Check', d: '"Kal raat heater chala?" Hindi mein voice check. "Nahi" pe wajah, aur har wajah ka alag hal.', to: '/pulse' },
          ].map(({ Icon, t, d, to }) => (
            <Link key={t} to={to} className="group rounded-xl border border-line bg-white p-5 hover:border-ink-3">
              <Icon className="size-6 text-[var(--accent-600)]" aria-hidden />
              <h3 className="mt-3 font-bold">{t}</h3>
              <p className="mt-1 text-sm text-ink-2">{d}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent-700)]">
                Kholo <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {ledger.byItem.heater.units + ledger.byItem.sapling.units > 0 && (
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Ab tak ka asar</h2>
            <Link to="/ledger" className="text-sm font-semibold text-[var(--accent-700)]">
              Impact Ledger →
            </Link>
          </div>
          <p className="mt-2 text-lg">
            {ledger.byItem.heater.checked > 0 && (
              <>
                <b>{ledger.byItem.heater.working}</b> / {ledger.byItem.heater.checked} checked heaters chal rahe ·{' '}
              </>
            )}
            {ledger.byItem.sapling.checked > 0 && (
              <>
                <b>{ledger.byItem.sapling.working}</b> / {ledger.byItem.sapling.checked} paudhe zinda ·{' '}
              </>
            )}
            <b>{ledger.peopleCovered.toLocaleString('en-IN')}</b> log covered
          </p>
        </section>
      )}
    </div>
  )
}
