/**
 * Confidence score fusion: four signals, each a plain +/- number, summed and clamped to
 * 0-100. Never a single black-box number — every score must be able to show its breakdown.
 */

export type SignalKey = 'wind' | 'pmRatio' | 'photo' | 'firms'

export interface SignalInput {
  /** wind blowing from the guessed source towards the report, 0 = wrong way, 1 = exact match */
  windMatch: number
  /** local PM2.5 divided by the region's background PM2.5 (1 = no spike, 3+ = strong spike) */
  pmRatio: number
  /** Gemini's confidence that the photo shows real burning/smoke, 0-1 (0 if no photo yet) */
  photoConfidence: number
  /** NASA FIRMS thermal point within ~2km and within the last few hours */
  firmsNearby: boolean
}

export interface SignalContribution {
  key: SignalKey
  /** points this signal adds or removes, already weighted */
  points: number
  /** one plain-language line a citizen or official can read, no jargon */
  detail: string
}

export interface ConfidenceResult {
  /** 0-100, sum of contributions clamped */
  total: number
  breakdown: SignalContribution[]
}

const BASE = 20

function windContribution(match: number): SignalContribution {
  const points = Math.round((match - 0.5) * 40)
  const detail =
    match >= 0.7 ? 'Wind is blowing this way from the guessed spot.'
    : match >= 0.4 ? 'Wind direction is a rough match.'
    : 'Wind is not blowing from the guessed spot.'
  return { key: 'wind', points, detail }
}

function pmRatioContribution(ratio: number): SignalContribution {
  const points = ratio >= 3 ? 25 : ratio >= 2 ? 15 : ratio >= 1.3 ? 5 : ratio >= 1 ? 0 : -10
  const detail =
    ratio >= 2 ? `Air here is ${ratio.toFixed(1)}x dirtier than nearby areas.`
    : ratio >= 1.3 ? `Air here is a bit dirtier than nearby areas (${ratio.toFixed(1)}x).`
    : 'Air here is close to the area average — no clear spike.'
  return { key: 'pmRatio', points, detail }
}

function photoContribution(confidence: number): SignalContribution {
  if (confidence <= 0) return { key: 'photo', points: 0, detail: 'No photo yet.' }
  const points = Math.round((confidence - 0.3) * 40)
  const detail =
    confidence >= 0.7 ? 'Photo clearly shows burning or smoke.'
    : confidence >= 0.4 ? 'Photo might show smoke, not fully clear.'
    : 'Photo does not look like smoke or burning.'
  return { key: 'photo', points, detail }
}

function firmsContribution(nearby: boolean): SignalContribution {
  return nearby
    ? { key: 'firms', points: 20, detail: 'A satellite fire point was seen close by, around this time.' }
    : { key: 'firms', points: -5, detail: 'No satellite fire point seen nearby.' }
}

/** Turns the four raw signals into a plain score with a visible +/- breakdown. */
export function computeConfidence(input: SignalInput): ConfidenceResult {
  const breakdown = [
    windContribution(input.windMatch),
    pmRatioContribution(input.pmRatio),
    photoContribution(input.photoConfidence),
    firmsContribution(input.firmsNearby),
  ]
  const raw = BASE + breakdown.reduce((sum, c) => sum + c.points, 0)
  return { total: Math.max(0, Math.min(100, raw)), breakdown }
}

/** demo inputs, one per lib/hotspot.ts demoHotspots() entry, so the lab screen matches */
export function demoSignals(): Record<string, SignalInput> {
  return {
    'hs-1': { windMatch: 0.8, pmRatio: 2.6, photoConfidence: 0.75, firmsNearby: true },
    'hs-2': { windMatch: 0.55, pmRatio: 1.6, photoConfidence: 0.4, firmsNearby: false },
    'hs-3': { windMatch: 0.9, pmRatio: 3.4, photoConfidence: 0.85, firmsNearby: true },
    'hs-4': { windMatch: 0.35, pmRatio: 1.1, photoConfidence: 0.3, firmsNearby: false },
  }
}
