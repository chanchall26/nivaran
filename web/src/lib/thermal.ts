/**
 * Thermal indices for both seasons, using the published standard formulas
 * (tests check them against the official reference tables):
 *   wind chill  - Environment Canada / US NWS 2001 formula (valid T <= 10 C, wind >= 4.8 km/h)
 *   heat index  - US NWS (Steadman simple form, then Rothfusz regression with its adjustments)
 */

/** Wind chill in C, from air temperature (C) and 10 m wind (km/h). */
export function windChill(tC: number, windKmh: number): number {
  if (tC > 10 || windKmh < 4.8) return tC
  const v = Math.pow(windKmh, 0.16)
  return 13.12 + 0.6215 * tC - 11.37 * v + 0.3965 * tC * v
}

/** Heat index in C, from air temperature (C) and relative humidity (%). */
export function heatIndex(tC: number, rh: number): number {
  const t = (tC * 9) / 5 + 32
  const simple = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094)
  let hi = simple
  if ((simple + t) / 2 >= 80) {
    hi =
      -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t -
      0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh
    if (rh < 13 && t >= 80 && t <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17)
    else if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) / 10) * ((87 - t) / 5)
  }
  return ((hi - 32) * 5) / 9
}
