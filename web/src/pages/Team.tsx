import { ArrowRight, BarChart3, BellRing, HandHeart, Home, Inbox as InboxIcon, PhoneCall, Sprout, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SectionTitle, TiltCard } from '../components/kit'
import { useI18n } from '../i18n'
import { useApp } from '../state'

function Tile({ to, Icon, hue, title, text, badge }: { to: string; Icon: typeof Home; hue: string; title: string; text: string; badge?: ReactNode }) {
  return (
    <Link to={to} className="group block rounded-3xl">
      <TiltCard className="surface-3d relative h-full p-5">
        {badge && <span className="pop absolute top-4 right-4">{badge}</span>}
        <span
          className="pop flex size-14 items-center justify-center rounded-2xl text-white"
          style={{
            background: `linear-gradient(145deg, ${hue}, color-mix(in oklab, ${hue} 70%, black))`,
            boxShadow: `0 5px 0 color-mix(in oklab, ${hue} 55%, black), 0 12px 20px -8px ${hue}`,
          }}
        >
          <Icon className="size-7" aria-hidden />
        </span>
        <h2 className="pop mt-4 font-display text-xl font-extrabold">{title}</h2>
        <p className="pop mt-1 text-ink-2">{text}</p>
        <ArrowRight className="pop mt-3 size-5 text-accent transition-transform group-hover:translate-x-1" aria-hidden />
      </TiltCard>
    </Link>
  )
}

export default function Team() {
  const { reports, deliveries, season } = useApp()
  const { s, f } = useI18n()
  const open = reports.filter((r) => r.status === 'open' && r.season === season).length
  const due = deliveries.filter((d) => d.status === 'delivered').length
  const badge = (text: string, tone: string) => (
    <span className="rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-[0_3px_0_rgb(0_0_0/0.2)]" style={{ background: tone }}>
      {text}
    </span>
  )

  return (
    <div className="space-y-6">
      <SectionTitle sub={s.team.intro}>{s.team.title}</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile to="/inbox" Icon={InboxIcon} hue="#e5484d" title={s.nav2.inbox} text={s.team.inboxD}
          badge={open > 0 && badge(f(s.team.open, { n: open }), 'var(--color-critical)')} />
        <Tile to="/alerts" Icon={BellRing} hue="#f07335" title={s.nav2.alerts} text={s.team.alertsD} />
        <Tile to="/match" Icon={HandHeart} hue="#12a150" title={s.nav.help} text={s.team.helpD} />
        <Tile to="/pulse" Icon={PhoneCall} hue="#8b5cf6" title={s.nav.check} text={s.team.checkD}
          badge={due > 0 && badge(f(s.team.due, { n: due }), '#8b5cf6')} />
        <Tile to="/trees" Icon={Sprout} hue="#2f9e44" title={s.nav2.trees} text={s.team.treesD} />
        <Tile to="/colony" Icon={Trophy} hue="#d4a017" title={s.nav2.colony} text={s.team.colonyD} />
        <Tile to="/cabin" Icon={Home} hue="#2f6fd6" title={s.nav2.cabin} text={s.team.cabinD} />
        <Tile to="/ledger" Icon={BarChart3} hue="#475569" title={s.nav.results} text={s.team.resultsD} />
      </div>
    </div>
  )
}
