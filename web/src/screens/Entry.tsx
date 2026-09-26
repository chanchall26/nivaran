/**
 * Login: who are you, where do you work, a little about you. The place comes from the browser's
 * location (after asking permission) or from a PIN code / city name. Workers never give a name.
 * "Try demo" skips everything with a ready profile.
 */
import { ArrowLeft, Check, Crosshair, LoaderCircle, Lock, MapPin } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { LOOK } from '../i18n/look'
import { placeFromGps, placeParams, type Place } from '../lib/place'
import { DEMO_PROFILES, type Profile, type Role, type Work } from '../lib/profile'
import { type Shift } from '../lib/risk'
import { ICON } from '../ui/atoms'
import { Emoji, type EmojiName } from '../ui/Emoji'
import { LangSwitch } from '../ui/Header'
import { PlaceMap } from '../ui/PlaceMap'
import { StationBoard } from '../ui/StationBoard'

function Field({ label, children, optional }: { label: string; children: ReactNode; optional?: boolean }) {
  const { t } = useI18n()
  return (
    <label className="block">
      <span className="label">
        {label} {optional && <span className="font-normal text-muted">({t.entry.optional})</span>}
      </span>
      {children}
    </label>
  )
}

function Chips<T extends string>({ value, options, onChange, label }: { value: T | undefined; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([k, l]) => (
          <button key={k} type="button" className="chip !px-3.5 !py-1.5 !text-[15px]" aria-pressed={value === k} onClick={() => onChange(k)}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

async function googleSignIn(): Promise<string | null> {
  const { firebase, firebaseEnabled } = await import('../lib/firebase')
  if (!firebaseEnabled) return null
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')
  const fb = firebase()
  if (!fb) return null
  const r = await signInWithPopup(fb.auth, new GoogleAuthProvider())
  return r.user.email
}

// ---------------------------------------------------------------------------------------------

/** The colourful left side: what Nivaran is, with live numbers for the place already known. */
function Hero() {
  const { t, lang } = useI18n()
  const L = LOOK[lang].login
  const floaters: { name: EmojiName; cls: string; size: number; delay: string }[] = [
    // a column of pollution-investigation icons down the right edge, clear of the text
    { name: 'satellite', cls: 'top-[11%] right-[7%]', size: 78, delay: '0s' },
    { name: 'fire', cls: 'top-[29%] right-[3%]', size: 56, delay: '-1.2s' },
    { name: 'search', cls: 'top-[45%] right-[9%]', size: 62, delay: '-2.1s' },
    { name: 'mask', cls: 'top-[62%] right-[3%]', size: 54, delay: '-0.6s' },
    { name: 'fog', cls: 'bottom-[5%] right-[8%]', size: 70, delay: '-1.7s' },
  ]
  return (
    <section className="grad-sunrise relative isolate flex flex-col justify-between overflow-hidden px-6 py-7 text-white sm:px-10 lg:min-h-dvh lg:py-10">
      {/* light spots and floating 3D emojis */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="absolute -top-24 -left-24 size-80 rounded-full bg-white/15 blur-3xl" />
        <span className="absolute -right-20 bottom-10 size-96 rounded-full bg-sky-300/25 blur-3xl" />
        {floaters.map((e) => (
          <span key={e.name} className={`absolute hidden sm:block ${e.cls}`} style={{ animationDelay: e.delay }}>
            <Emoji name={e.name} size={e.size} float slow eager />
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/20 shadow-lg ring-1 ring-white/40 backdrop-blur">
            <Emoji name="sunrise" size={34} eager />
          </span>
          <div className="leading-tight">
            <div className="font-display text-2xl font-bold">{t.app.name}</div>
            <div className="text-sm text-white/85">{lang === 'hi' ? 'Nivaran' : 'निवारण'}</div>
          </div>
        </div>
        <div className="lg:hidden">
          <LangSwitch />
        </div>
      </div>

      <div className="rise my-8 max-w-xl sm:pr-24 lg:my-0 lg:max-w-[27rem] lg:pr-0 xl:max-w-[30rem]">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-sm font-semibold ring-1 ring-white/35 backdrop-blur">
          <Emoji name="wave" size={20} eager /> {L.hello}
        </p>
        <h1 className="mt-4 font-display text-4xl leading-[1.08] font-extrabold sm:text-5xl lg:text-[3.2rem]">{t.app.entryLine}</h1>
        <p className="mt-2 font-display text-xl font-semibold text-white/95">{t.app.tagline}</p>
        <p className="mt-4 max-w-lg text-[17px] text-white/90">{L.heroSub}</p>
        <ul className="mt-6 hidden space-y-2.5 sm:block">
          {(
            [
              ['globe', L.features.live],
              ['map', L.features.map],
              ['check', L.features.check],
            ] as [EmojiName, string][]
          ).map(([e, text], i) => (
            <li key={e} className={`rise rise-${i + 1} flex items-center gap-3 rounded-2xl bg-white/15 px-3 py-2.5 ring-1 ring-white/25 backdrop-blur`}>
              <Emoji name={e} size={32} eager />
              <span className="font-medium">{text}</span>
            </li>
          ))}
        </ul>
      </div>

    </section>
  )
}

function Steps({ step }: { step: 1 | 2 | 3 }) {
  const { lang, f } = useI18n()
  const L = LOOK[lang].login
  return (
    <div>
      <div className="flex items-center justify-between text-sm font-semibold text-muted">
        <span>{f(L.step, { n: step })}</span>
        <span className="text-ink">{L.steps[step - 1]}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 rounded-full transition-all duration-500 ${n <= step ? 'grad-brand' : 'bg-line'}`} />
        ))}
      </div>
    </div>
  )
}

const ROLE_EMOJI: Record<Role, EmojiName> = { officer: 'building', partner: 'handshake', worker: 'worker' }

export default function Entry() {
  const { place, setPlace, setProfile, profile } = useApp()
  const { t, f, lang } = useI18n()
  const L = LOOK[lang].login
  const nav = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [role, setRole] = useState<Role | null>(profile?.demo ? null : (profile?.role ?? null))
  const [p, setP] = useState<Profile>(() => (profile && !profile.demo ? profile : { role: 'officer', demo: false }))
  const [chosen, setChosen] = useState<Place | null>(null)
  const [busy, setBusy] = useState<'gps' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [gErr, setGErr] = useState(false)
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }))
  const card = useRef<HTMLDivElement>(null)

  // move focus to the top of the card on each step, for keyboard and screen reader users
  useEffect(() => {
    card.current?.focus({ preventScroll: true })
  }, [step])

  const go = (prof: Profile, pl: Place | null) => {
    setProfile(prof)
    const next = pl ?? place
    if (pl) setPlace(pl)
    nav({ pathname: '/', search: `?${new URLSearchParams(placeParams(next))}` })
  }

  const detect = async () => {
    setBusy('gps')
    setErr(null)
    try {
      const pl = await placeFromGps()
      setChosen(pl)
    } catch {
      setErr(t.picker.locErr)
    } finally {
      setBusy(null)
    }
  }

  // location already allowed before: find the city without another click
  useEffect(() => {
    if (step !== 2 || chosen) return
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions
    perms
      ?.query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        if (s.state === 'granted') detect()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const google = async () => {
    setGErr(false)
    try {
      const email = await googleSignIn()
      if (!email) throw new Error('off')
      set({ email, name: p.name || email.split('@')[0] })
    } catch {
      setGErr(true)
    }
  }

  const roles: { r: Role; title: string; sub?: string; d: string }[] = [
    { r: 'officer', title: t.role.officer, sub: t.entry.officerSub, d: t.entry.officerD },
    { r: 'partner', title: t.role.partner, sub: t.entry.partnerSub, d: t.entry.partnerD },
    { r: 'worker', title: t.entry.workerT, d: t.entry.workerD },
  ]
  const howLine = !chosen
    ? ''
    : chosen.source === 'gps'
      ? L.detected
      : chosen.source === 'pin'
        ? f(L.fromPin, { pin: chosen.pin ?? '' })
        : L.fromSearch

  return (
    <div className="grid min-h-dvh bg-mist lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <Hero />

      <section className="relative flex items-start justify-center px-4 py-8 sm:px-8 lg:items-center lg:py-12">
        <div className="absolute top-5 right-6 hidden lg:block">
          <LangSwitch />
        </div>
        <div ref={card} tabIndex={-1} className="panel glass w-full max-w-xl p-5 outline-none sm:p-8">
          <Steps step={step} />

          {/* ---------- 1. who are you ---------- */}
          {step === 1 && (
            <div key="s1" className="page mt-6">
              <h2 className="font-display text-3xl font-bold">
                {/* the app's name in gradient, wherever it sits in the sentence */}
                {L.welcome.split(t.app.name)[0]}
                <span className="grad-text">{t.app.name}</span>
                {L.welcome.split(t.app.name)[1]}
              </h2>
              <p className="mt-1 text-muted">{L.roleHint}</p>
              <div role="radiogroup" aria-label={t.entry.title} className="mt-5 space-y-3">
                {roles.map(({ r, title, sub, d }, i) => {
                  const on = role === r
                  return (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setRole(r)
                        set({ role: r, demo: false })
                      }}
                      className={`lift rise rise-${i + 1} group relative flex w-full items-center gap-4 rounded-2xl border-2 p-3.5 text-left transition-colors sm:p-4 ${
                        on ? 'border-[#22c55e]/70 bg-[#0b3a2a]' : 'border-line bg-[#06152d] hover:border-[#2f5a9a]'
                      }`}
                    >
                      <span className={`grid size-16 shrink-0 place-items-center rounded-2xl ${on ? 'grad-brand' : 'bg-[#0e2344]'}`}>
                        <Emoji name={ROLE_EMOJI[r]} size={46} pop eager />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-lg leading-tight font-bold">{title}</span>
                        {sub && <span className="block text-sm text-muted">{sub}</span>}
                        <span className="mt-0.5 block text-[15px] leading-snug">{d}</span>
                      </span>
                      <span
                        aria-hidden
                        className={`grid size-7 shrink-0 place-items-center rounded-full border-2 transition-all ${on ? 'grad-brand scale-110 border-transparent text-white' : 'border-line'}`}
                      >
                        {on && <Check className="size-4" strokeWidth={3} />}
                      </span>
                    </button>
                  )
                })}
              </div>
              <button type="button" className="btn btn-ink mt-6 w-full text-lg" disabled={!role} onClick={() => setStep(2)}>
                {L.next}
              </button>
              <div className="mt-6 rounded-2xl border border-line bg-[#06152d] p-4">
                <p className="text-sm font-semibold">{L.demoTitle}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {roles.map(({ r, title }) => (
                    <button key={r} type="button" className="chip lift !py-1.5" onClick={() => go(DEMO_PROFILES[r], null)}>
                      <Emoji name={ROLE_EMOJI[r]} size={22} /> {title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---------- 2. your place ---------- */}
          {step === 2 && (
            <div key="s2" className="page mt-6">
              <h2 className="flex items-center gap-2 font-display text-3xl font-bold">
                <Emoji name="pin" size={36} float /> {L.placeTitle}
              </h2>
              <p className="mt-1 text-muted">{L.placeHint}</p>

              {chosen ? (
                <div className="pop-in mt-5 rounded-2xl border-2 border-[#22c55e]/60 bg-[#06152d] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-muted">{L.yourPlace}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChosen(null)}>
                      {L.change}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <StationBoard hi={chosen.nameHi} en={chosen.name} size="md" />
                    <div className="text-sm">
                      {chosen.region && <div className="font-semibold">{[chosen.region, chosen.pin].filter(Boolean).join(' · ')}</div>}
                      <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${chosen.pilot ? 'bg-[#15803d] text-white' : 'bg-[#16325c] text-[#c7d3ea]'}`}>
                        {chosen.pilot ? t.picker.pilotCity : t.picker.weatherAir}
                      </span>
                      {howLine && <div className="mt-1 flex items-center gap-1 text-muted"><Check className="size-4 text-[#4ade80]" strokeWidth={3} /> {howLine}</div>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={detect}
                    disabled={busy === 'gps'}
                    className="lift group flex flex-col items-center gap-3 rounded-2xl p-5 text-center text-white grad-monsoon shadow-lg"
                  >
                    <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/40">
                      {busy === 'gps' ? <LoaderCircle className="size-7 animate-spin" {...ICON} aria-hidden /> : <Crosshair className="size-7" {...ICON} aria-hidden />}
                    </span>
                    <span>
                      <span className="block font-display text-lg font-bold">{busy === 'gps' ? L.detecting : L.detect}</span>
                      <span className="block text-sm text-white/90">{L.allowNote}</span>
                    </span>
                  </button>

                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-[#06152d] p-5 text-center">
                    <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#0e2344]">
                      <MapPin className="size-7 text-[#4ade80]" {...ICON} aria-hidden />
                    </span>
                    <span className="block font-display text-lg font-bold">{L.chooseMap}</span>
                  </div>
                </div>
              )}

              {!chosen && (
                <div className="mt-4">
                  <PlaceMap onPick={setChosen} />
                  <p className="mt-2 text-center text-sm text-muted">{L.tapMap}</p>
                </div>
              )}

              <div aria-live="polite">{err && <p className="mt-4 rounded-xl bg-[#3b1520] px-3 py-2 text-sm font-medium text-[#fecdd3]">{err}</p>}</div>

              <div className="mt-6 flex gap-3">
                <button type="button" className="btn btn-line" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" {...ICON} aria-hidden /> {L.back}
                </button>
                <button type="button" className="btn btn-ink flex-1 text-lg" disabled={!chosen} onClick={() => setStep(3)}>
                  {L.next}
                </button>
              </div>
              {!chosen && <p className="mt-2 text-center text-xs text-muted">{L.choosePlace}</p>}
            </div>
          )}

          {/* ---------- 3. about you ---------- */}
          {step === 3 && role && (
            <form
              key="s3"
              className="page mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                go({ ...p, role, demo: false, pin: role !== 'officer' ? (p.pin ?? chosen?.pin) : p.pin }, chosen)
              }}
            >
              <h2 className="flex items-center gap-2 font-display text-3xl font-bold">
                <Emoji name={ROLE_EMOJI[role]} size={40} float /> {L.aboutTitle}
              </h2>
              <p className="-mt-2 text-muted">{role === 'worker' ? L.aboutWorker : L.aboutOfficer}</p>

              {role === 'officer' && (
                <>
                  <Field label={t.form.name}>
                    <input className="field" value={p.name ?? ''} onChange={(e) => set({ name: e.target.value })} autoComplete="name" />
                  </Field>
                  <Chips label={t.form.post} value={p.post} onChange={(v) => set({ post: v })} options={Object.entries(t.form.posts) as [NonNullable<Profile['post']>, string][]} />
                  <Chips label={t.form.dept} value={p.dept} onChange={(v) => set({ dept: v })} options={Object.entries(t.form.depts) as [NonNullable<Profile['dept']>, string][]} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t.form.wards}>
                      <input className="field" value={p.wards ?? ''} onChange={(e) => set({ wards: e.target.value })} />
                    </Field>
                    <Field label={t.form.budget}>
                      <input className="field tabular" inputMode="numeric" value={p.budget ?? ''} onChange={(e) => set({ budget: Number(e.target.value.replace(/\D/g, '')) || undefined })} placeholder="500000" />
                    </Field>
                  </div>
                </>
              )}

              {role === 'partner' && (
                <>
                  <Chips label={t.form.orgType} value={p.orgType} onChange={(v) => set({ orgType: v })} options={Object.entries(t.form.orgTypes) as [NonNullable<Profile['orgType']>, string][]} />
                  <Field label={t.form.orgName}>
                    <input className="field" value={p.orgName ?? ''} onChange={(e) => set({ orgName: e.target.value })} autoComplete="organization" />
                  </Field>
                  <Field label={t.form.count}>
                    <input className="field tabular" inputMode="numeric" value={p.count ?? ''} onChange={(e) => set({ count: Number(e.target.value.replace(/\D/g, '')) || undefined })} />
                  </Field>
                </>
              )}

              {role === 'worker' && (
                <>
                  <p className="flex items-center gap-2 rounded-2xl border border-[#16a34a]/40 bg-[#06311f] px-3 py-2.5 font-semibold text-[#c7f0d6]">
                    <Lock className="size-4 text-[#4ade80]" {...ICON} aria-hidden /> {t.entry.noName}
                  </p>
                  <Chips label={`${t.form.work} (${t.entry.optional})`} value={p.work} onChange={(v) => set({ work: v })} options={Object.entries(t.form.works) as [Work, string][]} />
                  <Chips label={`${t.form.shift} (${t.entry.optional})`} value={p.shift} onChange={(v) => set({ shift: v })} options={Object.entries(t.form.shifts) as [Shift, string][]} />
                </>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" className="btn btn-line" onClick={() => setStep(2)}>
                  <ArrowLeft className="size-4" {...ICON} aria-hidden /> {L.back}
                </button>
                <button type="submit" className="btn btn-ink flex-1 text-lg">
                  <Emoji name="rocket" size={24} /> {L.start}
                </button>
              </div>

              {role !== 'worker' && (
                <div className="border-t border-line pt-4">
                  {p.email ? (
                    <p className="text-sm font-semibold">{t.entry.signedIn.replace('{email}', p.email)}</p>
                  ) : (
                    <button type="button" className="btn btn-line w-full" onClick={google}>
                      <GoogleG /> {t.entry.google}
                    </button>
                  )}
                  {gErr && <p className="mt-2 text-sm text-muted">{t.entry.googleOff}</p>}
                </div>
              )}
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
                <Lock className="size-3.5" {...ICON} aria-hidden /> {L.private}
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
