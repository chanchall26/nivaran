/**
 * "Madad, Challan Nahi" routing policy and Pulse reason -> next step.
 * Only rules live here; all words shown to people are in src/i18n/strings.ts.
 */
import type { ItemType, PulseReason, ReportCategory, Route, Season } from './types'

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

/** Who acts on each route (a key into strings.route) and what item it usually needs. */
export const ROUTE_INFO: Record<Route, { who: string; item?: ItemType }> = {
  rwa_heater: { who: 'whoRwa', item: 'heater' },
  shelter_outreach: { who: 'whoShelter', item: 'warm_kit' },
  warm_kit: { who: 'whoKit', item: 'warm_kit' },
  municipal_cleanup: { who: 'whoCity' },
  shade_water: { who: 'whoShade', item: 'shade_net' },
  plantation: { who: 'whoTrees', item: 'sapling' },
  review: { who: 'whoVolunteer' },
}

export const SEASON_CATEGORIES: Record<Season, ReportCategory[]> = {
  sardi: ['guard_fire', 'homeless', 'labour_camp', 'waste_only', 'other'],
  garmi: ['heat_exposed', 'no_shade_spot', 'other'],
}

/** Heater running cost, the number that usually settles the "electricity bill" worry. */
export function heaterMonthlyCost(watts = 800, hoursPerNight = 6, nights = 30, inrPerKwh = 7) {
  return Math.round((watts / 1000) * hoursPerNight * nights * inrPerKwh)
}

/** Key into strings.action for what happens next. */
export function actionKey(item: ItemType, reason: PulseReason): string {
  if (reason === 'broken' && item === 'heater') return 'brokenHeater'
  return reason
}

/** Offline fallback when Gemini is unavailable: keyword rules over Hindi/Hinglish/English answers. */
export function parsePulseRules(answer: string, item: ItemType): { ok: boolean; reason: PulseReason } {
  const a = ` ${answer.toLowerCase().replace(/[.,!?।"]/g, ' ')} `
  // short words match whole tokens only ("no" must not match "phone")
  const has = (...w: string[]) => w.some((x) => (x.length <= 3 ? a.includes(` ${x} `) : a.includes(x)))
  if (has('socket', 'सॉकेट', 'point nahi', 'plug', 'प्लग', 'board nahi')) return { ok: false, reason: 'no_socket' }
  if (has('bill', 'बिल', 'bijli', 'बिजली', 'light ka', 'electricity')) return { ok: false, reason: 'electricity_bill' }
  if (has('door hai', 'दूर है', 'bahut door', 'बहुत दूर', 'too far', 'far away')) return { ok: false, reason: 'too_far' }
  // "bhara tha" alone means the water pot was FULL (good), so only shelter-capacity phrases count
  if (has('jagah nahi', 'जगह नहीं', 'no space', 'no room', 'shelter full', 'बसेरा भरा')) return { ok: false, reason: 'full' }
  if (has('band tha', 'बंद था', 'closed', 'tala', 'ताला')) return { ok: false, reason: 'closed' }
  if (has('mana', 'मना', 'rwa', 'secretary', 'सेक्रेटरी', 'malik', 'मालिक', 'allow', 'refused', 'said no', 'society'))
    return { ok: false, reason: 'rwa_refused' }
  if (has('toot', 'टूट', 'kharab', 'ख़राब', 'खराब', 'broken', 'jal gaya', 'leaks', 'टपकता')) return { ok: false, reason: 'broken' }
  if (has('chori', 'चोरी', 'le gaye', 'ले गए', 'hata', 'हटा', 'stolen', 'removed')) return { ok: false, reason: 'stolen' }
  if (has('sookh', 'सूख', 'mar gaya', 'मर गया', 'dead', 'died', 'drying')) return { ok: false, reason: 'plant_died' }
  if (has('paani nahi', 'पानी नहीं', 'khaali', 'ख़ाली', 'खाली', 'empty', 'no water'))
    return { ok: false, reason: item === 'sapling' ? 'plant_died' : 'no_water' }
  if (has('mila nahi', 'मिला नहीं', 'nahi mila', 'नहीं मिला', 'aaya nahi', 'nahi aaya', 'not received', 'have not received', 'not got'))
    return { ok: false, reason: 'not_received' }
  if (has('nahi', 'nahin', 'नहीं', 'nhi', 'no', 'not', 'band', 'बंद')) return { ok: false, reason: 'other' }
  if (has('haan', 'हाँ', 'हां', 'ha', 'han', 'ji', 'जी', 'yes', 'chala', 'चला', 'zinda', 'ज़िंदा', 'जिंदा', 'theek', 'ठीक',
    'mil gaya', 'मिल गया', 'ran', 'working', 'alive', 'comfortable', 'full', 'भरा', 'आराम'))
    return { ok: true, reason: 'none' }
  return { ok: false, reason: 'other' }
}
