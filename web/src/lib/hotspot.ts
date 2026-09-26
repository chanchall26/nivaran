/**
 * Hotspot + evidence shape.
 *
 * Track 4's guess at the Firestore doc shape (collections `hotspots` and `evidence`), written
 * before Track 2's `functions/` code existed. If Track 2 has since committed real callable
 * functions, reconcile this file's shape against theirs — see nivaran_parallel_tracks memory.
 */

export type SourceType = 'crop-burning' | 'brick-kiln' | 'vehicle' | 'industrial' | 'waste-burning' | 'unknown'
export type Severity = 'low' | 'medium' | 'high'
export type HotspotStatus = 'active' | 'confirmed' | 'resolved'

/** one of the three simulated federation state-nodes a hotspot belongs to */
export type StateNode = 'delhi-ncr' | 'punjab' | 'haryana'

export interface Hotspot {
  id: string
  lat: number
  lon: number
  /** ISO timestamp */
  createdAt: string
  updatedAt: string
  status: HotspotStatus
  sourceType: SourceType
  severity: Severity
  /** 0-100, see fusion.ts computeConfidence() — this is that score's total */
  confidence: number
  stateNode: StateNode
  /** short place name for display, e.g. "Sonipat, near NH44" */
  place: string
}

export interface Evidence {
  id: string
  hotspotId: string
  photoUrl: string
  /** Gemini's guess at what the photo shows */
  geminiLabel: SourceType
  /** Gemini's own confidence in that label, 0-1 */
  geminiConfidence: number
  submittedAt: string
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  low: '#E0B000',
  medium: '#F07F13',
  high: '#D7263D',
}

export const STATE_NODE_LABEL: Record<StateNode, string> = {
  'delhi-ncr': 'Delhi-NCR',
  punjab: 'Punjab',
  haryana: 'Haryana',
}

/** small, deterministic demo set so the standalone lab screen has something to show */
export function demoHotspots(): Hotspot[] {
  return [
    {
      id: 'hs-1',
      lat: 28.7041,
      lon: 77.1025,
      createdAt: '2026-09-25T13:00:00+05:30',
      updatedAt: '2026-09-26T06:00:00+05:30',
      status: 'active',
      sourceType: 'crop-burning',
      severity: 'high',
      confidence: 78,
      stateNode: 'delhi-ncr',
      place: 'Near Bawana, north-west Delhi',
    },
    {
      id: 'hs-2',
      lat: 30.383,
      lon: 76.5066,
      createdAt: '2026-09-25T17:00:00+05:30',
      updatedAt: '2026-09-26T05:30:00+05:30',
      status: 'active',
      sourceType: 'brick-kiln',
      severity: 'medium',
      confidence: 54,
      stateNode: 'punjab',
      place: 'Patiala outskirts, kiln belt',
    },
    {
      id: 'hs-3',
      lat: 29.1492,
      lon: 76.6486,
      createdAt: '2026-09-26T04:00:00+05:30',
      updatedAt: '2026-09-26T06:15:00+05:30',
      status: 'confirmed',
      sourceType: 'crop-burning',
      severity: 'high',
      confidence: 88,
      stateNode: 'haryana',
      place: 'Jind district, farm fields',
    },
    {
      id: 'hs-4',
      lat: 28.4595,
      lon: 77.0266,
      createdAt: '2026-09-26T02:00:00+05:30',
      updatedAt: '2026-09-26T06:20:00+05:30',
      status: 'active',
      sourceType: 'waste-burning',
      severity: 'low',
      confidence: 33,
      stateNode: 'delhi-ncr',
      place: 'Gurugram, sector dump site',
    },
  ]
}
