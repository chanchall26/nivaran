/**
 * Safety advice for the worker's day, from official sources: NDMA's heat advisory for outdoor
 * and gig workers (work and rest), MoHFW NPCCHH heat illness first aid ("cool first, then
 * transport"), and NDMA's cold wave guidelines (no coal fire in a closed room).
 * Shown only when the day calls for it.
 */
import { HeartPulse, Snowflake, Timer, type LucideIcon } from 'lucide-react'
import { useI18n } from '../i18n'
import { coldLevel, heatLevel, inShift, nightHours, type Day, type Shift } from '../lib/risk'

function Card({ Icon, color, title, lines, lead, src }: { Icon: LucideIcon; color: string; title: string; lines: string[]; lead?: string; src: string }) {
  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-3 text-[20px] font-bold">
        <Icon className="size-6 shrink-0" style={{ color }} strokeWidth={1.9} aria-hidden /> {title}
      </h2>
      {lead && <p className="mt-2 font-semibold">{lead}</p>}
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[16px]">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">{src}</p>
    </section>
  )
}

export function SafetyCards({ day, next, shift }: { day: Day; next?: Day; shift: Shift }) {
  const { t } = useI18n()
  const S = t.safety
  const shiftHours = day.hours.filter((h) => inShift(h.hour, shift))
  const heat = Math.max(0, ...shiftHours.map((h) => heatLevel(h.feels)))
  const cold = Math.max(0, ...(shift === 'night' ? nightHours(day, next) : shiftHours).map((h) => coldLevel(h.feels)))
  const cards = [
    heat >= 2 && <Card key="work" Icon={Timer} color="#fbbf24" title={S.workTitle} lines={S.work} src={S.workSrc} />,
    heat >= 1 && <Card key="heat" Icon={HeartPulse} color="#f87171" title={S.heatTitle} lead={S.heatSigns} lines={S.heatDo} src={S.heatSrc} />,
    cold >= 2 && <Card key="cold" Icon={Snowflake} color="#60a5fa" title={S.coldTitle} lines={S.coldDo} src={S.coldSrc} />,
  ].filter(Boolean)
  if (!cards.length) return null
  return <div className="grid gap-5 lg:grid-cols-2">{cards}</div>
}
