import { ArrowLeft, Building2, HardHat, Landmark } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { isPin, lookupPin } from '../lib/place'
import { DEMO_PROFILES, type Profile, type Role, type Work } from '../lib/profile'
import type { Shift } from '../lib/risk'
import { ICON } from '../ui/atoms'
import { LangSwitch } from '../ui/Header'
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
          <button key={k} type="button" className="chip !px-3.5 !py-1.5 !text-base" aria-pressed={value === k} onClick={() => onChange(k)}>
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
  const { auth } = fb
  const r = await signInWithPopup(auth, new GoogleAuthProvider())
  return r.user.email
}

export default function Entry() {
  const { place, setPlace, setProfile, profile } = useApp()
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { search } = useLocation()
  const [role, setRole] = useState<Role | null>(null)
  const [p, setP] = useState<Profile>(() => profile ?? { role: 'officer', demo: false })
  const [gErr, setGErr] = useState(false)
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }))

  const finish = (prof: Profile) => {
    setProfile(prof)
    // a PIN in the profile opens that place (demo profiles keep the place already chosen)
    if (!prof.demo && prof.pin && isPin(prof.pin) && prof.pin !== place.pin)
      lookupPin(prof.pin).then((pl) => pl && setPlace(pl)).catch(() => {})
    nav({ pathname: '/', search })
  }
  const choose = (r: Role) => {
    setRole(r)
    setP((x) => ({ ...x, role: r, demo: false }))
  }
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

  const tiles: { r: Role; title: string; sub?: string; d: string; Icon: typeof Landmark }[] = [
    { r: 'officer', title: t.role.officer, sub: t.entry.officerSub, d: t.entry.officerD, Icon: Landmark },
    { r: 'partner', title: t.role.partner, sub: t.entry.partnerSub, d: t.entry.partnerD, Icon: Building2 },
    { r: 'worker', title: t.entry.workerT, d: t.entry.workerD, Icon: HardHat },
  ]

  return (
    <div className="min-h-dvh bg-mist">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-8 pb-12 sm:pt-12">
        <div className="mb-6 flex w-full justify-end">
          <LangSwitch />
        </div>
        <StationBoard hi={place.nameHi} en={place.name} size="lg" />
        <p className="mt-4 text-center text-lg">{t.app.entryLine}</p>
        <p className="text-center text-sm text-muted">{t.app.tagline}</p>

        {!role ? (
          <>
            <h1 className="mt-10 mb-5 font-display text-3xl font-bold">{t.entry.title}</h1>
            <div className="grid w-full gap-4 md:grid-cols-3">
              {tiles.map(({ r, title, sub, d, Icon }) => (
                <div key={r} className={`panel flex flex-col p-5 ${r === 'officer' ? 'md:row-span-1' : ''}`}>
                  <button type="button" onClick={() => choose(r)} className="flex flex-1 flex-col items-start text-left">
                    <Icon className="size-9" {...ICON} aria-hidden />
                    <span className="mt-3 font-display text-2xl font-bold">{title}</span>
                    {sub && <span className="text-sm text-muted">{sub}</span>}
                    <span className="mt-2 text-[17px]">{d}</span>
                  </button>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-ink flex-1" onClick={() => choose(r)}>
                      {t.entry.choose}
                    </button>
                    <button type="button" className="btn btn-line flex-1" onClick={() => finish(DEMO_PROFILES[r])}>
                      {t.entry.tryDemo}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <form
            className="panel mt-10 w-full max-w-xl space-y-4 p-5 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault()
              finish({ ...p, role })
            }}
          >
            <div className="flex items-center justify-between">
              <button type="button" className="btn btn-ghost btn-sm -ml-2" onClick={() => setRole(null)}>
                <ArrowLeft className="size-4" {...ICON} aria-hidden /> {t.entry.back}
              </button>
              <button type="button" className="btn btn-line btn-sm" onClick={() => finish(DEMO_PROFILES[role])}>
                {t.entry.tryDemo}
              </button>
            </div>
            <h1 className="font-display text-2xl font-bold">{role === 'worker' ? t.entry.workerT : t.role[role]}</h1>

            {role === 'officer' && (
              <>
                <Field label={t.form.name}>
                  <input className="field" value={p.name ?? ''} onChange={(e) => set({ name: e.target.value })} autoComplete="name" />
                </Field>
                <Chips label={t.form.post} value={p.post} onChange={(v) => set({ post: v })} options={Object.entries(t.form.posts) as [NonNullable<Profile['post']>, string][]} />
                <Chips label={t.form.dept} value={p.dept} onChange={(v) => set({ dept: v })} options={Object.entries(t.form.depts) as [NonNullable<Profile['dept']>, string][]} />
                <Field label={t.form.city}>
                  <input className="field" value={p.city ?? ''} onChange={(e) => set({ city: e.target.value })} placeholder="Gwalior" />
                </Field>
                <Field label={t.form.wards}>
                  <input className="field" value={p.wards ?? ''} onChange={(e) => set({ wards: e.target.value })} />
                </Field>
                <Field label={t.form.budget}>
                  <input className="field tabular" inputMode="numeric" value={p.budget ?? ''} onChange={(e) => set({ budget: Number(e.target.value.replace(/\D/g, '')) || undefined })} placeholder="500000" />
                </Field>
              </>
            )}

            {role === 'partner' && (
              <>
                <Chips label={t.form.orgType} value={p.orgType} onChange={(v) => set({ orgType: v })} options={Object.entries(t.form.orgTypes) as [NonNullable<Profile['orgType']>, string][]} />
                <Field label={t.form.orgName}>
                  <input className="field" value={p.orgName ?? ''} onChange={(e) => set({ orgName: e.target.value })} autoComplete="organization" />
                </Field>
                <Field label={t.form.pin}>
                  <input className="field tabular" inputMode="numeric" maxLength={6} value={p.pin ?? ''} onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '') })} placeholder="474001" />
                </Field>
                <Field label={t.form.count}>
                  <input className="field tabular" inputMode="numeric" value={p.count ?? ''} onChange={(e) => set({ count: Number(e.target.value.replace(/\D/g, '')) || undefined })} />
                </Field>
              </>
            )}

            {role === 'worker' && (
              <>
                <p className="rounded-lg bg-mist px-3 py-2 font-semibold">{t.entry.noName}</p>
                <Chips label={`${t.form.work} (${t.entry.optional})`} value={p.work} onChange={(v) => set({ work: v })} options={Object.entries(t.form.works) as [Work, string][]} />
                <Chips label={`${t.form.shift} (${t.entry.optional})`} value={p.shift} onChange={(v) => set({ shift: v })} options={Object.entries(t.form.shifts) as [Shift, string][]} />
                <Field label={t.form.pin} optional>
                  <input className="field tabular" inputMode="numeric" maxLength={6} value={p.pin ?? ''} onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '') })} placeholder="474001" />
                </Field>
                <div>
                  <span className="label">{t.form.language}</span>
                  <LangSwitch />
                </div>
              </>
            )}

            <button type="submit" className="btn btn-ink w-full text-lg">
              {t.entry.continue}
            </button>
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
            <p className="text-center text-xs text-muted" lang={lang}>
              {t.app.tagline}
            </p>
          </form>
        )}
      </div>
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
