/** Who is using the app. Saved on this device only; the role decides the sidebar and home screen. */
import type { Shift } from './risk'

export type Role = 'officer' | 'partner' | 'worker'
export type Work = 'guard' | 'vendor' | 'construction' | 'delivery' | 'traffic' | 'other'

export interface Profile {
  role: Role
  demo: boolean
  // officer
  name?: string
  post?: 'commissioner' | 'zonal' | 'other'
  dept?: 'nagar_nigam' | 'smart_city' | 'disaster'
  city?: string
  wards?: string
  budget?: number
  // partner
  orgType?: 'rwa' | 'ngo' | 'csr' | 'security'
  orgName?: string
  pin?: string
  count?: number
  // worker (no name)
  work?: Work
  shift?: Shift
  /** signed in with Google (officer / partner only, optional) */
  email?: string
}

export const DEMO_PROFILES: Record<Role, Profile> = {
  officer: {
    role: 'officer', demo: true, name: 'Demo Officer', post: 'zonal', dept: 'nagar_nigam', city: 'Gwalior',
    wards: 'Lashkar, Shinde Ki Chhawani', budget: 500000,
  },
  partner: { role: 'partner', demo: true, orgType: 'security', orgName: 'Demo Security Services', pin: '474001', count: 40 },
  worker: { role: 'worker', demo: true, work: 'guard', shift: 'night', pin: '474001' },
}

const KEY = 'bm:profile'
export function loadProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Profile | null
    return p && ['officer', 'partner', 'worker'].includes(p.role) ? p : null
  } catch {
    return null
  }
}
export function saveProfile(p: Profile | null) {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p))
    else localStorage.removeItem(KEY)
  } catch {
    /* not remembered */
  }
}
