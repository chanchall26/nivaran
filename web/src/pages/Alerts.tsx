import { Check, Copy, History, Loader2, MessageCircle, Radio } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Btn, LevelPill, Panel, SectionTitle, TiltCard } from '../components/kit'
import { fmt, useI18n, type Lang } from '../i18n'
import { STRINGS } from '../i18n/strings'
import { cellLabel } from '../lib/format'
import { cityAlert, score, smokeTrap } from '../lib/scoring'
import type { WeatherSummary } from '../lib/types'
import { fetchOutlook, fetchReplay } from '../lib/weather'
import { useApp } from '../state'

const REPORT_URL = 'https://barahmasa-gwalior.web.app/report'

type Audience = 'rwa' | 'ngo' | 'market'

export default function Alerts() {
  const { city, season } = useApp()
  const { s, f, lang } = useI18n()
  const [mode, setMode] = useState<'live' | 'replay'>('live')
  const [outlook, setOutlook] = useState<Record<string, WeatherSummary[] | 'error'>>({})
  const [pick, setPick] = useState(0)
  const [audience, setAudience] = useState<Audience>('rwa')
  const [msgLang, setMsgLang] = useState<Lang>(lang)
  const [edited, setEdited] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const key = mode === 'live' ? 'live' : `replay-${season}`
  const days = outlook[key]

  useEffect(() => {
    if (outlook[key]) return
    let cancelled = false
    const p = mode === 'live' ? fetchOutlook(26.2124, 78.1772, 3) : fetchReplay(season).then((w) => [w])
    p.then((d) => !cancelled && setOutlook((o) => ({ ...o, [key]: d }))).catch(() => !cancelled && setOutlook((o) => ({ ...o, [key]: 'error' })))
    return () => {
      cancelled = true
    }
  }, [key, mode, season, outlook])

  const list = Array.isArray(days) ? days : []
  // default to the worst night/day
  const worstIdx = useMemo(() => {
    if (!list.length) return 0
    const val = (w: WeatherSummary) => (season === 'sardi' ? -w.nightMinFeels : w.dayMaxFeels)
    return list.reduce((best, w, i) => (val(w) > val(list[best]) ? i : best), 0)
  }, [list, season])
  const chosen = list[Math.min(pick, list.length - 1)] ?? null
  useEffect(() => setPick(worstIdx), [worstIdx])
  useEffect(() => setEdited(null), [pick, audience, msgLang, season, mode])

  const dateLabel = (w: WeatherSummary, l: Lang = lang) =>
    new Date(w.date + 'T12:00:00').toLocaleDateString(l === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

  const topAreas = useMemo(() => {
    if (!city || !chosen) return [] as string[]
    return [...city.cells]
      .map((c) => ({ c, sc: score(season, c, city.norms, chosen).score }))
      .sort((a, b) => a.sc - b.sc)
      .slice(0, 12)
      .map(({ c }) => cellLabel(c, STRINGS[msgLang], msgLang))
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 3)
  }, [city, chosen, season, msgLang])

  const audiences: Audience[] = season === 'sardi' ? ['rwa', 'ngo'] : ['rwa', 'market']
  const aud = audiences.includes(audience) ? audience : audiences[0]
  const template = (() => {
    const A = STRINGS[msgLang].alerts
    if (season === 'sardi') return aud === 'ngo' ? A.ngoSardi : A.rwaSardi
    return aud === 'market' ? A.marketGarmi : A.rwaGarmi
  })()
  const generated = chosen
    ? fmt(
        template,
        {
          d: dateLabel(chosen, msgLang),
          t: Math.round(season === 'sardi' ? chosen.nightMinFeels : chosen.dayMaxFeels),
          areas: topAreas.join(', '),
          url: REPORT_URL,
        },
        msgLang,
      )
    : ''
  const message = edited ?? generated

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked; the text is still selectable */
    }
  }

  const audLabel = { rwa: s.alerts.toRwa, ngo: s.alerts.toNgo, market: s.alerts.toMarket }

  return (
    <div className="space-y-6">
      <SectionTitle sub={season === 'sardi' ? s.alerts.introSardi : s.alerts.introGarmi}>{s.alerts.title}</SectionTitle>

      <div className="flex flex-wrap gap-2">
        {([
          ['live', s.weather.live, Radio],
          ['replay', season === 'sardi' ? s.weather.replaySardi : s.weather.replayGarmi, History],
        ] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            aria-pressed={mode === k}
            onClick={() => setMode(k)}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-2 font-bold ${
              mode === k ? 'border-transparent bg-ink text-bg shadow-[0_3px_0_rgb(var(--shade)/0.35)]' : 'border-line bg-surface text-ink-2'
            }`}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-3 font-display text-xl font-extrabold">{season === 'sardi' ? s.alerts.nights : s.alerts.days}</h2>
        {!days ? (
          <p className="flex items-center gap-2 text-ink-2">
            <Loader2 className="size-4 animate-spin" /> {s.alerts.loading}
          </p>
        ) : days === 'error' ? (
          <p className="text-critical">{s.alerts.failed}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {list.map((w, i) => {
              const a = cityAlert(season, w)
              const trap = Math.round(smokeTrap(w) * 100)
              const on = i === pick
              return (
                <button key={w.date + i} type="button" onClick={() => setPick(i)} aria-pressed={on} className="text-left">
                  <TiltCard
                    className={`h-full rounded-3xl border-2 p-5 transition-colors ${
                      on ? 'border-accent bg-accent-soft shadow-[0_6px_0_var(--accent-edge)]' : 'border-line bg-surface shadow-[0_6px_0_var(--line)]'
                    }`}
                  >
                    <div className="pop text-sm font-bold text-ink-2">
                      {season === 'sardi' ? f(s.alerts.night, { d: dateLabel(w) }) : f(s.alerts.day, { d: dateLabel(w) })}
                    </div>
                    <div className="pop mt-2 font-display text-5xl font-extrabold tabular">
                      {Math.round(season === 'sardi' ? w.nightMinFeels : w.dayMaxFeels)}°
                    </div>
                    <div className="pop text-sm text-ink-2">
                      {f(s.alerts.feels, { t: Math.round(season === 'sardi' ? w.nightMinFeels : w.dayMaxFeels) })}
                    </div>
                    <div className="pop mt-3">
                      <LevelPill level={a.level} text={s.level[a.level]} />
                    </div>
                    {season === 'sardi' ? (
                      <div className="pop mt-4">
                        <div className="flex justify-between text-xs font-semibold text-ink-2">
                          <span>{f(s.alerts.trap, { v: trap })}</span>
                          <span className="tabular">{Math.round(w.ventilation)} m²/s</span>
                        </div>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-cool" style={{ width: `${trap}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="pop mt-3 text-sm text-ink-2">{f(s.alert.humidity, { h: Math.round(w.dayMeanHumidity) })}</p>
                    )}
                  </TiltCard>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {chosen && (
        <Panel>
          <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
            <div className="space-y-4">
              <div>
                <div className="mb-2 font-display font-extrabold">{s.alerts.messageFor}</div>
                <div className="flex flex-wrap gap-2">
                  {audiences.map((k) => (
                    <button key={k} type="button" aria-pressed={aud === k} onClick={() => setAudience(k)}
                      className={`rounded-2xl border px-4 py-2 font-bold ${aud === k ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2'}`}>
                      {audLabel[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 font-display font-extrabold">{s.alerts.msgLang}</div>
                <div className="flex gap-2">
                  {(['hi', 'en'] as Lang[]).map((l) => (
                    <button key={l} type="button" aria-pressed={msgLang === l} onClick={() => setMsgLang(l)}
                      className={`rounded-2xl border px-4 py-2 font-bold ${msgLang === l ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2'}`}>
                      {l === 'hi' ? 'हिंदी' : 'English'}
                    </button>
                  ))}
                </div>
              </div>
              {topAreas.length > 0 && (
                <div>
                  <div className="mb-2 font-display font-extrabold">{s.alerts.topAreas}</div>
                  <ol className="space-y-1.5">
                    {topAreas.map((a, i) => (
                      <li key={a} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold">
                        <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs text-bg">{i + 1}</span> {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {/* WhatsApp-style bubble preview, editable */}
              <div className="rounded-3xl bg-[#e7ffdb] p-3 shadow-[var(--shadow-3d)] [color-scheme:light]">
                <textarea
                  value={message}
                  onChange={(e) => setEdited(e.target.value)}
                  rows={7}
                  className="w-full resize-y rounded-2xl bg-transparent p-2 text-[15px] leading-relaxed text-[#111b21] outline-none"
                  aria-label={s.alerts.messageFor}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-3d px-5 py-3 text-white"
                  style={{ background: '#25d366', ['--edge' as string]: '#128c4b' }}
                >
                  <MessageCircle className="size-5" aria-hidden /> {s.alerts.share}
                </a>
                <Btn variant="soft" size="md" onClick={copy}>
                  {copied ? <Check className="size-5" /> : <Copy className="size-5" />} {copied ? s.alerts.copied : s.alerts.copy}
                </Btn>
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
