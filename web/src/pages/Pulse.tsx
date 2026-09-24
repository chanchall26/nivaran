import { CheckCircle2, Loader2, Mic, MicOff, PhoneCall, PhoneOff, Send, Volume2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Btn, Panel, SectionTitle } from '../components/kit'
import { useI18n } from '../i18n'
import { STRINGS } from '../i18n/strings'
import { analysePulse, type PulseAnalysis } from '../lib/ai'
import { allocName } from '../lib/format'
import { ITEMS } from '../lib/match'
import { actionKey, heaterMonthlyCost } from '../lib/policy'
import { store } from '../lib/store'
import type { Delivery, DeliveryStatus, ItemType } from '../lib/types'
import { useApp } from '../state'

/** The call is always spoken in Hindi: that is what guards and vendors in Gwalior speak. */
function spokenQuestion(item: ItemType) {
  return `नमस्ते! बारहमासा से बात कर रहे हैं। ${STRINGS.hi.question[item]}`
}

function speak(text: string) {
  return new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'hi-IN'
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('hi'))
    if (voice) u.voice = voice
    u.rate = 0.95
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  })
}

type SR = {
  start: () => void; stop: () => void; lang: string; interimResults: boolean
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
  onend: () => void; onerror: () => void
}
const SpeechRecognitionCtor =
  (window as unknown as { SpeechRecognition?: new () => SR }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition

function nextStatus(item: ItemType, a: PulseAnalysis): DeliveryStatus {
  if (item === 'sapling') return a.reason === 'plant_died' || a.reason === 'stolen' ? 'dead' : 'alive'
  return a.ok ? 'working' : 'not_working'
}
const priority = (d: Delivery) => (d.status === 'delivered' ? 0 : d.status === 'not_working' || d.status === 'dead' ? 1 : 2)

const STATUS_DOT: Record<DeliveryStatus, string> = {
  planned: 'bg-line', delivered: 'bg-warning', working: 'bg-good', alive: 'bg-good', not_working: 'bg-critical', dead: 'bg-critical',
}

export default function Pulse() {
  const { city, deliveries, pulses, season } = useApp()
  const { s, f, lang } = useI18n()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'asking' | 'listening' | 'thinking' | 'done'>('idle')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<PulseAnalysis | null>(null)
  const [micOn, setMicOn] = useState(false)
  const rec = useRef<SR | null>(null)
  const byH3 = useMemo(() => new Map((city?.cells ?? []).map((c) => [c.h3, c])), [city])
  const placeById = useMemo(() => new Map((city?.places ?? []).map((p) => [p.id, p])), [city])

  const due = useMemo(
    () =>
      deliveries
        .filter((d) => d.status !== 'planned')
        .filter((d) => ITEMS[d.item].season === season || ITEMS[d.item].season === 'both')
        .sort((a, b) => priority(a) - priority(b) || (a.lastPulseAt ?? 0) - (b.lastPulseAt ?? 0)),
    [deliveries, season],
  )
  const active = deliveries.find((d) => d.id === activeId) ?? null
  const history = pulses.filter((p) => p.deliveryId === activeId).sort((a, b) => b.createdAt - a.createdAt)

  const nameOf = (d: Delivery) => {
    const cell = byH3.get(d.h3)
    const place = d.placeId ? placeById.get(d.placeId) : undefined
    if (!cell) return d.placeName
    return allocName(place ? { kind: 'place', place } : { kind: 'cell' }, cell, s, lang)
  }

  useEffect(() => () => speechSynthesis?.cancel(), [])

  const start = async (d: Delivery) => {
    setActiveId(d.id)
    setAnswer('')
    setResult(null)
    setPhase('asking')
    await speak(spokenQuestion(d.item))
    setPhase('listening')
  }

  const listen = () => {
    if (!SpeechRecognitionCtor) return
    const r = new SpeechRecognitionCtor()
    r.lang = 'hi-IN'
    r.interimResults = true
    r.onresult = (e) => setAnswer(Array.from(e.results).map((x) => x[0].transcript).join(' '))
    const off = () => {
      rec.current = null
      setMicOn(false)
    }
    r.onend = off
    r.onerror = off
    rec.current = r
    r.start()
    setMicOn(true)
  }

  const submit = async (text = answer) => {
    if (!active || !text.trim()) return
    rec.current?.stop()
    setAnswer(text)
    setPhase('thinking')
    const a = await analysePulse(text, active.item)
    setResult(a)
    setPhase('done')
    const now = Date.now()
    await store.add('pulses', {
      deliveryId: active.id, question: STRINGS.hi.question[active.item], answer: text, ok: a.ok, reason: a.reason,
      action: actionKey(active.item, a.reason), createdAt: now, ai: a.ai,
    })
    await store.update('deliveries', active.id, { status: nextStatus(active.item, a), lastPulseAt: now, lastReason: a.reason })
    if (a.followUpHi) speak(a.followUpHi)
  }

  if (!due.length && !active) {
    return (
      <div className="mx-auto max-w-xl space-y-4 text-center">
        <SectionTitle>{s.check.title}</SectionTitle>
        <Panel>
          <PhoneCall className="mx-auto size-12 text-ink-3" aria-hidden />
          <p className="mt-3 text-lg text-ink-2">{s.check.empty}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link to="/match" className="btn-3d btn-primary px-5 py-3">{s.nav.help}</Link>
            <Link to="/ledger" className="btn-3d btn-soft px-5 py-3">{s.nav.results}</Link>
          </div>
        </Panel>
      </div>
    )
  }

  const actionText = (item: ItemType, reason: PulseAnalysis['reason']) =>
    f(s.action[actionKey(item, reason) as keyof typeof s.action], { cost: heaterMonthlyCost() })

  return (
    <div className="space-y-6">
      <SectionTitle sub={s.check.intro}>{s.check.title}</SectionTitle>
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Panel className="!p-3">
          <h2 className="px-2 pt-1 pb-2 font-display text-lg font-extrabold">{f(s.check.toCheck, { n: due.length })}</h2>
          <ul className="max-h-[60dvh] space-y-1.5 overflow-y-auto">
            {due.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => start(d)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                    d.id === activeId ? 'bg-accent-soft' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
                    <PhoneCall className="size-4 text-accent" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{nameOf(d)}</span>
                    <span className="text-xs text-ink-3">{d.qty} × {s.item[d.item]}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                    <span className={`size-2.5 rounded-full ${STATUS_DOT[d.status]}`} aria-hidden />
                    <span className="hidden sm:inline">{s.status[d.status]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        {/* the call screen */}
        <div className="surface-3d relative overflow-hidden !rounded-[2rem] p-5 sm:p-7">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent opacity-15 blur-3xl" />
          {!active ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <span className="flex size-24 items-center justify-center rounded-full bg-surface-2 shadow-[var(--shadow-3d)]">
                <PhoneCall className="size-10 text-ink-3" aria-hidden />
              </span>
              <p className="mt-4 max-w-sm text-lg text-ink-2">{s.check.pick}</p>
              <p className="mt-2 text-xs text-ink-3">{s.check.ivrNote}</p>
            </div>
          ) : (
            <div className="relative space-y-5">
              <div className="flex items-center gap-4">
                <span className="relative flex size-16 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_5px_0_var(--accent-edge)]">
                  <PhoneCall className="size-7" aria-hidden />
                  {(phase === 'asking' || phase === 'listening') && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-30" aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-3">{s.check.onCall}</div>
                  <div className="truncate font-display text-xl font-extrabold">{nameOf(active)}</div>
                  <div className="text-sm text-ink-2">{active.qty} × {s.item[active.item]}</div>
                </div>
              </div>

              <div className="rounded-3xl rounded-tl-md bg-surface-2 p-4 shadow-[inset_0_1px_0_var(--hl)]">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-3">
                  <Volume2 className="size-4 text-accent" aria-hidden /> {s.check.asking}
                </div>
                <p className="mt-1 font-display text-xl font-bold">{STRINGS.hi.question[active.item]}</p>
                {lang === 'en' && <p className="text-ink-2">{s.question[active.item]}</p>}
                <button type="button" onClick={() => speak(spokenQuestion(active.item))} className="mt-2 text-sm font-bold text-accent underline">
                  {s.check.playAgain}
                </button>
              </div>

              {phase === 'asking' && (
                <p className="flex items-center gap-2 text-ink-2">
                  <Loader2 className="size-4 animate-spin" /> {s.check.speaking}
                </p>
              )}

              {(phase === 'listening' || phase === 'thinking') && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {s.quick[active.item].map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={phase === 'thinking'}
                        onClick={() => submit(q)}
                        className="rounded-2xl border border-line bg-surface px-3.5 py-2 text-left text-sm font-semibold shadow-[0_3px_0_var(--line)] transition-transform active:translate-y-0.5"
                      >
                        “{q}”
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {SpeechRecognitionCtor && (
                      <Btn
                        variant={micOn ? 'primary' : 'soft'}
                        onClick={() => (micOn ? rec.current?.stop() : listen())}
                        aria-label={micOn ? s.check.micStop : s.check.mic}
                      >
                        {micOn ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                      </Btn>
                    )}
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      placeholder={s.check.answerHint}
                      className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 py-3"
                    />
                    <Btn onClick={() => submit()} disabled={!answer.trim() || phase === 'thinking'} aria-label={s.check.answer}>
                      {phase === 'thinking' ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
                    </Btn>
                  </div>
                </div>
              )}

              {phase === 'done' && result && (
                <div className="anim-rise space-y-3">
                  <div className="ml-auto max-w-[85%] rounded-3xl rounded-tr-md bg-ink px-4 py-3 text-bg">“{answer}”</div>
                  <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 font-display text-lg font-extrabold ${result.ok ? 'bg-good/15 text-good' : 'bg-critical/15 text-critical'}`}>
                    {result.ok ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
                    {result.ok ? s.check.working : f(s.check.notWorking, { reason: s.reason[result.reason] })}
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-ink-3">{s.check.nextStep}</div>
                    <p className="mt-1 font-semibold">{actionText(active.item, result.reason)}</p>
                  </div>
                  {(lang === 'hi' ? result.followUpHi : result.followUpEn) && (
                    <p className="text-sm text-ink-2">
                      {s.app.name}: {lang === 'hi' ? result.followUpHi : result.followUpEn}
                    </p>
                  )}
                  <p className="text-xs text-ink-3">{result.ai === 'gemini' ? s.check.byGemini : s.check.byRules}</p>
                  <Btn variant="soft" onClick={() => { setPhase('idle'); setActiveId(null) }}>
                    <PhoneOff className="size-4" /> {s.check.endCall}
                  </Btn>
                </div>
              )}

              {history.length > 0 && (
                <div>
                  <div className="mb-1.5 text-sm font-bold">{s.check.history}</div>
                  <ul className="space-y-1 text-sm">
                    {history.slice(0, 4).map((p) => (
                      <li key={p.id} className="flex gap-2">
                        <span className="text-ink-3 tabular">{new Date(p.createdAt).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN')}</span>
                        <span className={`font-semibold ${p.ok ? 'text-good' : 'text-critical'}`}>{s.reason[p.reason]}</span>
                        <span className="truncate text-ink-2">“{p.answer}”</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
