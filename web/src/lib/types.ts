export type Season = 'garmi' | 'sardi'

/** One H3 cell with the structural features built by pipeline/build_grid.py. */
export interface Cell {
  h3: string
  lat: number
  lon: number
  area: string | null
  areaHi: string | null
  /** km to the nearest named locality, and the compass direction from it */
  areaKm: number
  areaDir: string
  pop: number
  canopy: number | null
  lst: number | null
  roadKm: number
  exposed: number
  poi: Partial<Record<string, number>>
  shelterKm: number
}

export type PlaceKind =
  | 'guard_post'
  | 'rehri_zone'
  | 'transit'
  | 'worksite'
  | 'shelter'
  | 'homeless_spot'
  | 'labour_chowk'

/** A Bahar-Log point: somewhere people are outdoors for long hours. */
export interface Place {
  id: string
  kind: PlaceKind
  lat: number
  lon: number
  name: string | null
  source: 'osm-anchored' | 'synthetic' | 'demo'
  who: string
  staff?: number
  capacity?: number
  anchor?: string
}

export interface CityMeta {
  city: string
  cityHi: string
  center: [number, number]
  h3Resolution: number
  cells: number
  population: number
  layers: Record<string, string>
  lstRange: [number, number]
}

/** Hourly weather in Open-Meteo's shape (wind in m/s). */
export interface HourlyWeather {
  time: string[]
  temperature_2m: number[]
  apparent_temperature: number[]
  relative_humidity_2m: number[]
  wind_speed_10m: number[]
  boundary_layer_height: number[]
  shortwave_radiation?: number[]
  pm2_5?: (number | null)[]
}

export type WeatherSource = 'live' | 'replay' | 'typical'

/** The handful of numbers the scores actually need, for one night or one day. */
export interface WeatherSummary {
  source: WeatherSource
  label: string
  /** ISO date of the night (sardi) or day (garmi) summarised */
  date: string
  // sardi (night 20:00-07:00)
  nightMinTemp: number
  nightMinFeels: number
  /** median ventilation coefficient over the night, m2/s */
  ventilation: number
  nightMinBlh: number
  nightMeanWind: number
  // garmi (day 11:00-17:00)
  dayMaxTemp: number
  dayMaxFeels: number
  dayMeanHumidity: number
  pm25: number | null
  hourly?: HourlyWeather
}

export type ItemType = 'heater' | 'warm_kit' | 'cabin' | 'shade_net' | 'water_pot' | 'sapling'

export type ReportCategory =
  | 'guard_fire'
  | 'homeless'
  | 'labour_camp'
  | 'waste_only'
  | 'heat_exposed'
  | 'no_shade_spot'
  | 'other'

export type Route =
  | 'rwa_heater'
  | 'shelter_outreach'
  | 'warm_kit'
  | 'municipal_cleanup'
  | 'shade_water'
  | 'plantation'
  | 'review'

export interface Report {
  id: string
  season: Season
  category: ReportCategory
  route: Route
  lat: number
  lon: number
  h3: string
  /** blurred JPEG as a data URL; the raw photo never leaves the device */
  thumb?: string
  facesBlurred: number
  peoplePresent: boolean
  /** Gemini's one-line description in English; summaryHi in Hindi. Empty for rule-based reports. */
  summary: string
  summaryHi?: string
  note?: string
  status: 'open' | 'assigned' | 'resolved'
  createdAt: number
  resolvedAt?: number
  ai: 'gemini' | 'rules'
  demo?: boolean
}

export type DeliveryStatus = 'planned' | 'delivered' | 'working' | 'not_working' | 'alive' | 'dead'

export interface Delivery {
  id: string
  item: ItemType
  qty: number
  placeId?: string
  h3: string
  lat: number
  lon: number
  placeName: string
  donor: string
  status: DeliveryStatus
  createdAt: number
  deliveredAt?: number
  lastPulseAt?: number
  lastReason?: PulseReason
  people: number
  demo?: boolean
}

export type PulseReason =
  | 'none'
  | 'electricity_bill'
  | 'rwa_refused'
  | 'broken'
  | 'stolen'
  | 'no_water'
  | 'plant_died'
  | 'not_received'
  | 'other'

export interface PulseCheck {
  id: string
  deliveryId: string
  question: string
  answer: string
  ok: boolean
  reason: PulseReason
  action: string
  createdAt: number
  ai: 'gemini' | 'rules'
  demo?: boolean
}
