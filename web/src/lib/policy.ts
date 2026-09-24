/**
 * "Madad, Challan Nahi" routing policy and Pulse reason -> solution routes.
 * Kept as plain data so it can be read, argued with and changed in one place.
 */
import type { ItemType, PulseReason, ReportCategory, Route, Season } from './types'

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  guard_fire: 'Guard garam rehne ke liye aag jala raha hai',
  homeless: 'Beghar log thand mein bahar',
  labour_camp: 'Mazdoor camp / basti mein aag',
  waste_only: 'Sirf kachre ka dher jal raha hai (koi insaan nahi)',
  heat_exposed: 'Log dhoop mein bina chhaaya ke kaam kar rahe',
  no_shade_spot: 'Jagah jahan chhaaya / paani chahiye',
  other: 'Kuch aur',
}

/**
 * The core rule: if people are there, the report can only lead to HELP.
 * Only a pure waste pile (no people) goes to the municipality for pickup.
 */
export function routeFor(category: ReportCategory, peoplePresent: boolean): Route {
  if (category === 'waste_only' && !peoplePresent) return 'municipal_cleanup'
  switch (category) {
    case 'guard_fire':
      return 'rwa_heater'
    case 'homeless':
      return 'shelter_outreach'
    case 'labour_camp':
      return 'warm_kit'
    case 'heat_exposed':
      return 'shade_water'
    case 'no_shade_spot':
      return 'plantation'
    case 'waste_only':
      return 'warm_kit' // people were present after all: treat as warmth need
    default:
      return 'review'
  }
}

export const ROUTE_INFO: Record<Route, { label: string; who: string; item?: ItemType; enforcement: false }> = {
  rwa_heater: { label: 'RWA / malik ko heater request + guard ko warm kit', who: 'RWA, CSR heater pool', item: 'heater', enforcement: false },
  shelter_outreach: { label: 'Rain basera night-round team ko alert', who: 'NGO / Nagar Nigam shelter team', item: 'warm_kit', enforcement: false },
  warm_kit: { label: 'Warm kit aur kambal delivery', who: 'NGO volunteers', item: 'warm_kit', enforcement: false },
  municipal_cleanup: { label: 'Nagar Nigam ko kachra uthane ki request (challan nahi)', who: 'Nagar Nigam sanitation', enforcement: false },
  shade_water: { label: 'Shade net + pyau lagane ki request', who: 'CSR / market association', item: 'shade_net', enforcement: false },
  plantation: { label: 'Plantation list mein jagah jodi gayi', who: 'Van vibhag / CSR plantation', item: 'sapling', enforcement: false },
  review: { label: 'Volunteer review karega', who: 'Barahmasa volunteer', enforcement: false },
}

export const SEASON_CATEGORIES: Record<Season, ReportCategory[]> = {
  sardi: ['guard_fire', 'homeless', 'labour_camp', 'waste_only', 'other'],
  garmi: ['heat_exposed', 'no_shade_spot', 'other'],
}

// ---- Pulse ------------------------------------------------------------------------------

export const PULSE_QUESTION: Record<ItemType, string> = {
  heater: 'Namaste! Barahmasa se baat kar rahe hain. Kal raat aapka heater chala tha?',
  warm_kit: 'Namaste! Barahmasa se. Kya aapko kambal aur warm kit mil gaya, aur aap use kar rahe hain?',
  cabin: 'Namaste! Barahmasa se. Kya naya cabin aapko garmi aur thand se bacha raha hai?',
  shade_net: 'Namaste! Barahmasa se. Kya shade net abhi bhi laga hai aur chhaaya de raha hai?',
  water_pot: 'Namaste! Barahmasa se. Kya pyau mein aaj paani bhara hua tha?',
  sapling: 'Namaste! Barahmasa se. Kya aapke paas laga paudha zinda hai aur use paani mil raha hai?',
}

export const REASON_LABEL: Record<PulseReason, string> = {
  none: 'Sab theek',
  electricity_bill: 'Bijli ke bill ka darr',
  rwa_refused: 'RWA / malik ne mana kiya',
  broken: 'Kharaab / toota hua',
  stolen: 'Chori ho gaya / hata diya',
  no_water: 'Paani nahi mila',
  plant_died: 'Paudha sookh gaya',
  not_received: 'Mila hi nahi',
  other: 'Kuch aur',
}

/** Heater running cost, the number that usually settles the "bijli bill" worry. */
export function heaterMonthlyCost(watts = 800, hoursPerNight = 6, nights = 30, inrPerKwh = 7) {
  return Math.round((watts / 1000) * hoursPerNight * nights * inrPerKwh)
}

export function actionFor(item: ItemType, reason: PulseReason): string {
  switch (reason) {
    case 'none':
      return 'Kuch nahi karna. Agli Pulse call 7 din baad.'
    case 'electricity_bill':
      return `RWA ko bill calculator bheja: 800 W heater, 6 ghante/raat = lagbhag ₹${heaterMonthlyCost()}/mahina. Timer plug aur insulated cabin ka option bhi.`
    case 'rwa_refused':
      return 'RWA secretary ko DPCC-style advisory aur "Barahmasa Colony" badge ka invitation. 3 din mein follow-up call.'
    case 'broken':
      return item === 'heater' ? 'Warranty replacement request; tab tak warm kit bheja gaya.' : 'Repair team ko ticket; 48 ghante mein visit.'
    case 'stolen':
      return 'Naya unit tabhi jab lock-point ho; NGO partner se site visit.'
    case 'no_water':
      return 'Paas ki dukaan/RWA ko "pyau saathi" banaya; roz subah refill reminder.'
    case 'plant_died':
      return 'Replacement sapling (monsoon mein) + tree guard + paas ke dukaandaar ko "ped saathi" banaya.'
    case 'not_received':
      return 'Delivery partner se proof maanga; donor dashboard pe "pending" flag.'
    default:
      return 'Volunteer 48 ghante mein call karega.'
  }
}

/** Offline fallback when Gemini is unavailable: keyword rules over Hindi/Hinglish answers. */
export function parsePulseRules(answer: string, item: ItemType): { ok: boolean; reason: PulseReason } {
  const a = ` ${answer.toLowerCase().replace(/[.,!?।]/g, ' ')} `
  // short words match whole tokens only ("no" must not match "phone")
  const has = (...w: string[]) => w.some((x) => (x.length <= 3 ? a.includes(` ${x} `) : a.includes(x)))
  const negative = has('nahi', 'nahin', 'नहीं', 'nhi', 'no', 'band', 'बंद', 'mana', 'मना')
  if (has('bill', 'बिल', 'bijli', 'बिजली', 'light ka')) return { ok: false, reason: 'electricity_bill' }
  if (has('mana', 'मना', 'rwa', 'secretary', 'malik', 'मालिक', 'allow')) return { ok: false, reason: 'rwa_refused' }
  if (has('toot', 'टूट', 'kharab', 'खराब', 'broken', 'jal gaya')) return { ok: false, reason: 'broken' }
  if (has('chori', 'चोरी', 'le gaye', 'hata', 'हटा')) return { ok: false, reason: 'stolen' }
  if (has('sookh', 'सूख', 'mar gaya', 'मर गया', 'dead')) return { ok: false, reason: 'plant_died' }
  if (has('paani nahi', 'पानी नहीं', 'khaali', 'खाली')) return { ok: false, reason: item === 'sapling' ? 'plant_died' : 'no_water' }
  if (has('mila nahi', 'मिला नहीं', 'nahi mila', 'नहीं मिला', 'aaya nahi', 'nahi aaya')) return { ok: false, reason: 'not_received' }
  if (negative) return { ok: false, reason: 'other' }
  if (has('haan', 'हाँ', 'हां', 'ha', 'han', 'ji', 'जी', 'yes', 'chala', 'चला', 'zinda', 'ज़िंदा', 'जिंदा', 'theek', 'ठीक', 'mil gaya'))
    return { ok: true, reason: 'none' }
  return { ok: false, reason: 'other' }
}
