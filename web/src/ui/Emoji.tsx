/**
 * 3D emoji (Microsoft Fluent Emoji, MIT), served from /emoji so they work offline.
 * Decorative by default (empty alt, hidden from screen readers); pass `label` when the emoji
 * carries meaning on its own.
 */
import type { Condition } from '../lib/risk'

export type EmojiName =
  | 'sun' | 'sun_cloud' | 'cloud_rain' | 'storm' | 'snowflake' | 'cold_face' | 'hot_face' | 'fire' | 'fog' | 'wind'
  | 'mask' | 'thermometer' | 'droplet' | 'tree' | 'seedling' | 'pin' | 'map' | 'building' | 'handshake' | 'worker'
  | 'guard' | 'police' | 'bell' | 'clipboard' | 'check' | 'shield' | 'money' | 'house' | 'hospital' | 'umbrella'
  | 'calendar' | 'wave' | 'phone' | 'speaker' | 'sparkles' | 'chart' | 'gear' | 'megaphone' | 'city' | 'globe'
  | 'moon' | 'lock' | 'satellite' | 'compass' | 'rocket' | 'star' | 'bulb' | 'package' | 'raise_hand' | 'ambulance'
  | 'leaf' | 'sunrise' | 'rainbow' | 'cloud' | 'bar_chart' | 'office' | 'hourglass' | 'party' | 'search' | 'telephone'
  | 'mountain' | 'scooter' | 'truck' | 'tools' | 'people' | 'evergreen'

export function Emoji({
  name, size = 40, float, pop, slow, className, label, eager,
}: {
  name: EmojiName
  size?: number
  /** gentle bob (stops with reduced motion) */
  float?: boolean
  /** grows and tilts when its link or card is hovered */
  pop?: boolean
  slow?: boolean
  className?: string
  label?: string
  eager?: boolean
}) {
  return (
    <img
      src={`/emoji/${name}.png`}
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`emoji ${float ? 'emoji-float' : ''} ${slow ? 'slow' : ''} ${pop ? 'emoji-pop' : ''} ${className ?? ''}`}
      style={{ width: size, height: size }}
    />
  )
}

/** Weather code (WMO) to a 3D emoji; clear nights get the moon. */
export function wxEmoji(code: number | undefined, isDay = true): EmojiName {
  if (code == null || code <= 0) return isDay ? 'sun' : 'moon'
  if (code <= 2) return isDay ? 'sun_cloud' : 'cloud'
  if (code === 3) return 'cloud'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowflake'
  if (code >= 51) return 'cloud_rain'
  return 'cloud'
}

/** The emoji for each condition screen. */
export const COND_EMOJI: Record<Condition, EmojiName> = {
  mild: 'sparkles',
  warm: 'sun',
  hot: 'hot_face',
  air: 'mask',
  cold: 'cold_face',
  double: 'hot_face',
  rain: 'umbrella',
}
