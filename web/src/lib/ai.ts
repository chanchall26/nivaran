/**
 * Gemini through Firebase AI Logic (client SDK, Gemini Developer API backend).
 * Every call has a rule-based fallback so the product still works offline or
 * without a Firebase project; results say which path produced them.
 */
import { getAI, getGenerativeModel, GoogleAIBackend, Schema, type GenerativeModel } from 'firebase/ai'
import { firebase } from './firebase'
import { parsePulseRules, routeFor } from './policy'
import type { ItemType, PulseReason, ReportCategory, Route, Season } from './types'

export const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3-flash-preview'
/** tried when the main model is overloaded or retired */
const FALLBACK_MODEL = 'gemini-flash-lite-latest'

const models = new Map<string, GenerativeModel[]>()
function modelChain(key: string, schema: Schema, system: string): GenerativeModel[] | null {
  const fb = firebase()
  if (!fb) return null
  if (!models.has(key)) {
    const ai = getAI(fb.app, { backend: new GoogleAIBackend() })
    const make = (name: string) =>
      getGenerativeModel(ai, {
        model: name,
        systemInstruction: system,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
      })
    models.set(key, [make(GEMINI_MODEL), make(FALLBACK_MODEL)])
  }
  return models.get(key)!
}

/** Generate JSON with the main model, falling back once if it errors (overload, retirement). */
async function generateJson(chain: GenerativeModel[], request: Parameters<GenerativeModel['generateContent']>[0]) {
  let last: unknown
  for (const m of chain) {
    try {
      const res = await m.generateContent(request)
      return JSON.parse(res.response.text())
    } catch (e) {
      last = e
    }
  }
  throw last
}

// ---- report photo -----------------------------------------------------------------------

const CATEGORIES: ReportCategory[] = [
  'guard_fire', 'homeless', 'labour_camp', 'waste_only', 'heat_exposed', 'no_shade_spot', 'other',
]

const reportSchema = Schema.object({
  properties: {
    category: Schema.enumString({ enum: CATEGORIES }),
    peoplePresent: Schema.boolean(),
    fireVisible: Schema.boolean(),
    summaryEn: Schema.string({ description: 'One short, simple English sentence describing the situation, never the people' }),
    summaryHi: Schema.string({ description: 'The same sentence in simple Hindi (Devanagari)' }),
    plantable: Schema.enumString({ enum: ['yes', 'maybe', 'no', 'not_applicable'] }),
    plantableWhy: Schema.string(),
    confidence: Schema.enumString({ enum: ['high', 'medium', 'low'] }),
  },
})

const REPORT_SYSTEM = `You help "Barahmasa", a service in Gwalior, India that sends HELP (heaters, blankets,
shade, water, trees) to people who work or live outdoors. You look at a photo (faces already blurred)
and classify the situation. Rules:
- NEVER describe, identify or speculate about who a person is, their caste, religion, or appearance.
- Describe the situation and the place only.
- A fire with a person sitting near it for warmth is guard_fire (if it looks like a gate/guard post/booth)
  or homeless (pavement, under a bridge, bedding) or labour_camp (tents, worksite huts).
- waste_only means a burning or smouldering pile with nobody around.
- heat_exposed: people working in direct sun with no shade. no_shade_spot: a street/market/bus stop
  with no shade (even without people).
- plantable: could a street tree be planted here (open soil or footpath edge, no overhead wires, not on road)?
- Describe ONLY what is visible in the photo. The reporter's note is context, not evidence: if the photo
  does not show what the note claims (or is not a street photo at all), say so in the summary and set
  confidence to low.
- Write summaryEn in simple English and summaryHi in simple Hindi (Devanagari), max 20 words each.`

export interface ReportAnalysis {
  category: ReportCategory
  peoplePresent: boolean
  summary: string
  summaryHi?: string
  plantable?: string
  confidence: 'high' | 'medium' | 'low'
  route: Route
  ai: 'gemini' | 'rules'
  error?: string
}

export async function analyseReport(opts: {
  imageDataUrl?: string
  season: Season
  userCategory: ReportCategory
  userPeoplePresent: boolean
  note?: string
}): Promise<ReportAnalysis> {
  const fallback = (error?: string): ReportAnalysis => ({
    category: opts.userCategory,
    peoplePresent: opts.userPeoplePresent,
    summary: opts.note?.trim() ?? '',
    confidence: 'medium',
    route: routeFor(opts.userCategory, opts.userPeoplePresent),
    ai: 'rules',
    error,
  })
  const m = modelChain('report', reportSchema, REPORT_SYSTEM)
  if (!m || !opts.imageDataUrl) return fallback()
  try {
    const [, mime, b64] = opts.imageDataUrl.match(/^data:(.+?);base64,(.*)$/) ?? []
    const j = await generateJson(m, [
      { inlineData: { mimeType: mime, data: b64 } },
      {
        text: `Season: ${opts.season}. Reporter chose: ${opts.userCategory}; says people present: ${opts.userPeoplePresent}. ` +
          `Reporter note: ${opts.note || '(none)'}. Classify.`,
      },
    ])
    // Safety rule wins over the model: if either the reporter or the model saw people,
    // it is a people case and can never be routed to enforcement/cleanup.
    const people = Boolean(j.peoplePresent) || opts.userPeoplePresent
    const category: ReportCategory = CATEGORIES.includes(j.category) ? j.category : opts.userCategory
    return {
      category,
      peoplePresent: people,
      summary: String(j.summaryEn ?? '').slice(0, 200),
      summaryHi: String(j.summaryHi ?? '').slice(0, 200),
      plantable: j.plantable !== 'not_applicable' ? `${j.plantable}: ${j.plantableWhy ?? ''}` : undefined,
      confidence: j.confidence ?? 'medium',
      route: routeFor(category, people),
      ai: 'gemini',
    }
  } catch (e) {
    console.warn('Gemini report analysis failed, using rules', e)
    return fallback(String(e))
  }
}

// ---- pulse answer ---------------------------------------------------------------------

const REASONS: PulseReason[] = [
  'none', 'electricity_bill', 'rwa_refused', 'broken', 'stolen', 'no_water', 'plant_died', 'not_received', 'other',
]
const pulseSchema = Schema.object({
  properties: {
    ok: Schema.boolean({ description: 'true if the help is being used / working / alive' }),
    reason: Schema.enumString({ enum: REASONS }),
    followUpHi: Schema.string({ description: 'One short, warm Hindi (Devanagari) sentence to say back to the caller' }),
    followUpEn: Schema.string({ description: 'The same sentence in simple English' }),
  },
})
const PULSE_SYSTEM = `You understand short answers from security guards, vendors and volunteers in Gwalior
to a check-in call about help they received (heater, blanket kit, cabin, shade net, water pot, sapling).
Answers may be Hindi, Hinglish, Bundeli or broken English, often via speech-to-text with errors.
Decide whether the help is working/being used (ok) and, if not, the main reason:
electricity_bill (fear of bill / owner says bill too high), rwa_refused (RWA, society, owner or secretary
does not allow), broken, stolen (or removed), no_water, plant_died, not_received, other.
followUpHi / followUpEn: one warm, respectful sentence acknowledging the answer (and, if not ok, saying help will follow).`

export interface PulseAnalysis {
  ok: boolean
  reason: PulseReason
  followUpHi: string
  followUpEn: string
  ai: 'gemini' | 'rules'
}

export async function analysePulse(answer: string, item: ItemType): Promise<PulseAnalysis> {
  const rules = (): PulseAnalysis => {
    const r = parsePulseRules(answer, item)
    return {
      ...r,
      followUpHi: r.ok ? 'बहुत अच्छा, धन्यवाद! हम अगले हफ़्ते फिर पूछेंगे।' : 'समझ गए, धन्यवाद। हमारी टीम जल्दी मदद भेजेगी।',
      followUpEn: r.ok ? 'Very good, thank you! We will ask again next week.' : 'Understood, thank you. Our team will send help soon.',
      ai: 'rules',
    }
  }
  const m = modelChain('pulse', pulseSchema, PULSE_SYSTEM)
  if (!m || !answer.trim()) return rules()
  try {
    const j = await generateJson(m, `Item: ${item}\nAnswer: """${answer}"""`)
    const reason: PulseReason = REASONS.includes(j.reason) ? j.reason : 'other'
    const ok = Boolean(j.ok) && reason === 'none'
    return { ok, reason: ok ? 'none' : reason, followUpHi: j.followUpHi ?? '', followUpEn: j.followUpEn ?? '', ai: 'gemini' }
  } catch (e) {
    console.warn('Gemini pulse analysis failed, using rules', e)
    return rules()
  }
}

export const aiMode = () => (firebase() ? `Gemini (${GEMINI_MODEL}) · Firebase AI Logic` : 'Rules (Gemini off)')
