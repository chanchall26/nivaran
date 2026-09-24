import { CheckCircle2, Loader2, Mic, MicOff, PhoneCall, PhoneOff, Send, Volume2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import { aiMode, analysePulse, type PulseAnalysis } from '../lib/ai'
import { ITEMS } from '../lib/match'
import { PULSE_QUESTION, REASON_LABEL } from '../lib/policy'
import { store } from '../lib/store'
import type { Delivery, DeliveryStatus, ItemType } from '../lib/types'
import { useApp } from '../state'

/** Devanagari versions for text-to-speech (hi-IN voices read Roman Hindi badly). */
const SPOKEN: Record<ItemType, string> = {
  heater: 'नमस्ते! बारहमासा से बात कर रहे हैं। कल रात आपका हीटर चला था?',
  warm_kit: 'नमस्ते! बारहमासा से। क्या आपको कंबल और गर्म किट मिल गई, और आप उसे इस्तेमाल कर रहे हैं?',
  cabin: 'नमस्ते! बारहमासा से। क्या नया केबिन आपको गर्मी और ठंड से बचा रहा है?',
  shade_net: 'नमस्ते! बारहमासा से। क्या छाया जाल अभी भी लगा है और छाया दे रहा है?',
  water_pot: 'नमस्ते! बारहमासा से। क्या प्याऊ में आज पानी भरा हुआ था?',
  sapling: 'नमस्ते! बारहमासा से। क्या आपके पास लगा पौधा ज़िंदा है और उसे पानी मिल रहा है?',
}

const QUICK: Record<ItemType, string[]> = {
  heater: ['Haan ji, poori raat chala', 'Nahi, RWA bolti hai bijli ka bill zyada aayega', 'Secretary ne mana kar diya', 'Heater kharab ho gaya'],
  warm_kit: ['Haan mil gaya, pehen rahe hain', 'Nahi mila abhi tak', 'Kambal chori ho gaya'],
  cabin: ['Haan, bahut aaram hai', 'Chhat se paani tapakta hai, toot gaya'],
  shade_net: ['Haan laga hai', 'Nagar nigam wale hata le gaye'],
  water_pot: ['Haan bhara tha', 'Khaali pada tha, koi bharta nahi'],
  sapling: ['Haan zinda hai, roz paani dete hain', 'Paani nahi mila, sookh raha hai', 'Paudha sookh gaya'],
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

type SR = { start: () => void; stop: () => void; lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void; onerror: (e: { error: string }) => void }
const SpeechRecognitionCtor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition

const priority = (d: Delivery) => (d.status === 'delivered' ? 0 : d.status === 'not_working' || d.status === 'dead' ? 1 : 2)

function nextStatus(item: ItemType, a: PulseAnalysis): DeliveryStatus {
  if (item === 'sapling') return a.reason === 'plant_died' || a.reason === 'stolen' ? 'dead' : 'alive'
  return a.ok ? 'working' : 'not_working'
}

export default function Pulse() {
  const { deliveries, pulses, season } = useApp()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'asking' | 'listening' | 'thinking' | 'done'>('idle')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<PulseAnalysis | null>(null)
  const rec = useRef<SR | null>(null)
  const [micOn, setMicOn] = useState(false)

  const due = useMemo(
    () =>
      deliveries
        .filter((d) => d.status !== 'planned')
        .filter((d) => ITEMS[d.item].season === season || ITEMS[d.item].season === 'both')
        // never-checked first, then failing ones, then the longest since last call
        .sort((a, b) => priority(a) - priority(b) || (a.lastPulseAt ?? 0) - (b.lastPulseAt ?? 0)),
    [deliveries, season],
  )
  const active = deliveries.find((d) => d.id === activeId) ?? null
  const history = pulses.filter((p) => p.deliveryId === activeId).sort((a, b) => b.createdAt - a.createdAt)

  useEffect(() => () => speechSynthesis?.cancel(), [])

  const start = async (d: Delivery) => {
    setActiveId(d.id)
    setAnswer('')
    setResult(null)
    setPhase('asking')
    await speak(SPOKEN[d.item])
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
      deliveryId: active.id, question: PULSE_QUESTION[active.item], answer: text, ok: a.ok, reason: a.reason,
      action: a.action, createdAt: now, ai: a.ai,
    })
    await store.update('deliveries', active.id, { status: nextStatus(active.item, a), lastPulseAt: now, lastReason: a.reason })
    if (a.followUp) speak(a.followUp)
  }

  if (!deliveries.length) {
    return (
      <div className="mx-auto max-w-xl space-y-3 text-center">
        <h1 className="text-2xl font-bold">Pulse Check</h1>
        <p className="text-ink-2">
          Abhi koi madad deliver nahi hui. Pehle <Link className="font-semibold underline" to="/match">Match</Link> se plan
          banao, ya <Link className="font-semibold underline" to="/ledger">Impact</Link> page pe demo data load karo.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Pulse Check</h1>
        <p className="mt-1 max-w-3xl text-ink-2">
          Baantna success nahi, <b className="text-ink">chalna aur bachna</b> success hai. Guard ya volunteer ko unki bhasha
          mein chhota sa sawaal; "nahi" aaye toh wajah, aur har wajah ka alag hal. Asli deployment mein ye IVR / missed-call se
          hoga; yahan browser mein wahi flow.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Card title={`Check karne hain (${due.length})`}>
          <ul className="max-h-[560px] space-y-1 overflow-y-auto">
            {due.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => start(d)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-black/5 ${
                    d.id === activeId ? 'bg-[var(--accent-50)]' : ''
                  }`}
                >
                  <PhoneCall className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.placeName}</span>
                    <span className="text-xs text-ink-3">
                      {d.qty}× {ITEMS[d.item].label}
                    </span>
                  </span>
                  <StatusDot status={d.status} />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={active ? `Call: ${active.placeName}` : 'Call'}>
          {!active ? (
            <p className="text-ink-3">Baayein list se kisi pe click karo; call shuru hogi.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-paper p-4">
                <Volume2 className="mt-0.5 size-5 shrink-0 text-[var(--accent-600)]" aria-hidden />
                <div>
                  <div className="text-xs text-ink-3">Barahmasa poochh raha hai</div>
                  <p className="text-lg font-semibold">{SPOKEN[active.item]}</p>
                  <p className="text-sm text-ink-2">{PULSE_QUESTION[active.item]}</p>
                  <button type="button" onClick={() => speak(SPOKEN[active.item])} className="mt-1 text-xs font-semibold underline">
                    Dobara suno
                  </button>
                </div>
              </div>

              {phase === 'asking' && <p className="flex items-center gap-2 text-ink-2"><Loader2 className="size-4 animate-spin" /> Bol rahe hain…</p>}

              {(phase === 'listening' || phase === 'thinking') && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {QUICK[active.item].map((q) => (
                      <button key={q} type="button" onClick={() => submit(q)} disabled={phase === 'thinking'}
                        className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-black/5">
                        “{q}”
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {SpeechRecognitionCtor && (
                      <button
                        type="button"
                        onClick={() => (micOn ? rec.current?.stop() : listen())}
                        className={`rounded-lg px-3 ${micOn ? 'bg-critical text-white' : 'border border-line'}`}
                        aria-label={micOn ? 'Mic band karo' : 'Bol ke jawab do'}
                      >
                        {micOn ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                      </button>
                    )}
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      placeholder="Jawab bolo ya likho (Hindi / Hinglish)"
                      className="flex-1 rounded-lg border border-line px-3 py-2"
                    />
                    <button type="button" onClick={() => submit()} disabled={!answer.trim() || phase === 'thinking'}
                      className="rounded-lg bg-ink px-3 text-white disabled:opacity-40" aria-label="Bhejo">
                      {phase === 'thinking' ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
                    </button>
                  </div>
                </div>
              )}

              {phase === 'done' && result && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-line p-4">
                    <div className="text-xs text-ink-3">Jawab</div>
                    <p className="font-medium">“{answer}”</p>
                    <div className="mt-3 flex items-center gap-2">
                      {result.ok ? <CheckCircle2 className="size-5 text-good" /> : <XCircle className="size-5 text-critical" />}
                      <b>{result.ok ? 'Chal raha hai' : `Nahi chal raha · ${REASON_LABEL[result.reason]}`}</b>
                    </div>
                    <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Solution route</div>
                      {result.action}
                    </div>
                    {result.followUp && <p className="mt-2 text-sm text-ink-2">Barahmasa: {result.followUp}</p>}
                    <p className="mt-2 text-xs text-ink-3">{result.ai === 'gemini' ? 'Gemini ne samjha' : 'Rules se samjha'} · {aiMode()}</p>
                  </div>
                  <button type="button" onClick={() => { setPhase('idle'); setActiveId(null) }}
                    className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold">
                    <PhoneOff className="size-4" /> Call khatam
                  </button>
                </div>
              )}

              {history.length > 0 && (
                <div>
                  <div className="mb-1 text-sm font-semibold">Pichhli calls</div>
                  <ul className="space-y-1 text-sm">
                    {history.slice(0, 5).map((p) => (
                      <li key={p.id} className="flex gap-2">
                        <span className="text-ink-3 tabular">{new Date(p.createdAt).toLocaleDateString('en-IN')}</span>
                        <span className={p.ok ? 'text-good' : 'text-critical'}>{p.ok ? 'OK' : REASON_LABEL[p.reason]}</span>
                        <span className="truncate text-ink-2">“{p.answer}”</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: DeliveryStatus }) {
  const map: Record<DeliveryStatus, [string, string]> = {
    planned: ['bg-line', 'planned'],
    delivered: ['bg-warning', 'check baaki'],
    working: ['bg-good', 'chal raha'],
    alive: ['bg-good', 'zinda'],
    not_working: ['bg-critical', 'nahi chal raha'],
    dead: ['bg-critical', 'sookh gaya'],
  }
  const [c, l] = map[status]
  return (
    <span className="flex items-center gap-1 text-xs text-ink-2">
      <span className={`size-2 rounded-full ${c}`} aria-hidden />
      {l}
    </span>
  )
}
