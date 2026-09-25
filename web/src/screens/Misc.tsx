import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApp, useDay } from '../ctx'
import { useI18n } from '../i18n'
import { clockDate, clockTime, hourLabel, weekday } from '../lib/ist'
import { conditionOf, hourLevel, LEVEL_COLOR, modesOf, needsForDay, type Level } from '../lib/risk'
import { taskStore, useDb } from '../lib/tasks'
import { DemoTag, ICON, LevelBadge } from '../ui/atoms'
import { LangSwitch } from '../ui/Header'
import { ChecksPanel, DueList, HoursPanel, NeedsCards, PanelBox, WhoList } from './panels'
import { useHelp } from './shared'
import { useRows } from './shared'
import { DayTabs, MapWithCard } from './Today'

export function MapScreen() {
  const rows = useRows()
  const { t } = useI18n()
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-[28px] font-bold">{t.nav.map}</h1>
        <DayTabs />
      </div>
      <p className="flex flex-wrap items-center gap-3 text-sm text-muted">
        {t.map.legend}:
        {([0, 1, 2, 3] as Level[]).map((l) => (
          <span key={l} className="flex items-center gap-1 font-semibold text-ink">
            <span className="size-3 rounded-full" style={{ background: LEVEL_COLOR[l] }} aria-hidden /> {t.level[l]}
          </span>
        ))}
      </p>
      <MapWithCard rows={rows} height="h-[calc(100dvh-15rem)] min-h-[420px]" />
    </div>
  )
}

export function NeedsScreen() {
  const { t } = useI18n()
  const { profile } = useApp()
  const today = useDay(0)
  const tomorrow = useDay(1)
  const rows = useRows(0)
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[28px] font-bold">{t.nav.needs}</h1>
      <PanelBox emoji="clipboard" title={t.needs.title}>
        <NeedsCards modes={today.modes} big needs={today.day ? needsForDay(today.modes, conditionOf(today.day, today.next)) : undefined} />
      </PanelBox>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        {tomorrow.day && (
          <PanelBox emoji="calendar" title={t.needs.titleTomorrow}>
            <NeedsCards modes={tomorrow.modes} needs={tomorrow.day ? needsForDay(tomorrow.modes, conditionOf(tomorrow.day, tomorrow.next)) : undefined} />
          </PanelBox>
        )}
        <PanelBox emoji="people" title={t.who.title}>
          <WhoList rows={rows} plan={profile?.role === 'officer'} />
        </PanelBox>
      </div>
    </div>
  )
}

export function ChecksScreen() {
  const { t } = useI18n()
  const help = useHelp()
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[28px] font-bold">{t.checks.title}</h1>
      <PanelBox emoji="check" title={t.checks.title}>
        <ChecksPanel full />
      </PanelBox>
      {help.local.length > 0 && (
        <PanelBox emoji="telephone" title={t.checks.due}>
          <DueList tasks={help.local} />
        </PanelBox>
      )}
      <PanelBox emoji="shield" title={t.hours.title}>
        <HoursPanel />
      </PanelBox>
    </div>
  )
}

export function HoursScreen() {
  const { t } = useI18n()
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[28px] font-bold">{t.hours.title}</h1>
      <PanelBox emoji="shield" title={t.hours.title}>
        <HoursPanel big />
      </PanelBox>
    </div>
  )
}

interface Window {
  date: string
  from: number
  to: number
  level: Level
  feels: number
}

/** Runs of hours at "Get ready" or worse in the next 3 days. */
function riskyWindows(days: { date: string; hours: { hour: number; feels: number; aqi: number | null }[] }[]): Window[] {
  const out: Window[] = []
  for (const d of days.slice(0, 3)) {
    let cur: Window | null = null
    for (const h of d.hours) {
      const l = hourLevel(h)
      if (l >= 2) {
        if (!cur) cur = { date: d.date, from: h.hour, to: h.hour + 1, level: l, feels: h.feels }
        else {
          cur.to = h.hour + 1
          if (l > cur.level) cur.level = l
          if (Math.abs(h.feels - 25) > Math.abs(cur.feels - 25)) cur.feels = h.feels
        }
      } else if (cur) {
        out.push(cur)
        cur = null
      }
    }
    if (cur) out.push(cur)
  }
  return out
}

export function AlertsScreen() {
  const { t, f, lang } = useI18n()
  const { wx, place } = useApp()
  const { requests } = useDb()
  const wins = wx ? riskyWindows(wx.data.days) : []
  const name = lang === 'hi' ? place.nameHi : place.name
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[28px] font-bold">{t.alerts.title}</h1>
      <PanelBox emoji="bell" title={t.alerts.upcoming}>
        {!wins.length ? (
          <p className="text-muted">{t.alerts.none}</p>
        ) : (
          <ul className="divide-y divide-line">
            {wins.map((w) => {
              const day = weekday(w.date, lang)
              const d = wx!.data.days.find((x) => x.date === w.date)!
              const advice = t.worker.advice[modesOf(d)[0]]
              const msg = f(t.alerts.msg, {
                place: name, level: t.level[w.level], day, from: hourLabel(w.from, lang), to: hourLabel(w.to % 24, lang), t: Math.round(w.feels), advice,
              })
              return (
                <li key={`${w.date}-${w.from}`} className="flex flex-wrap items-center gap-3 py-3">
                  <LevelBadge level={w.level} />
                  <span className="font-semibold">{f(t.alerts.window, { day, from: hourLabel(w.from, lang), to: hourLabel(w.to % 24, lang) })}</span>
                  <span className="text-sm text-muted">
                    {t.today.feels} {Math.round(w.feels)}°
                  </span>
                  <a className="btn btn-line btn-sm ml-auto" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="size-4" {...ICON} aria-hidden /> {t.alerts.share}
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </PanelBox>
      <PanelBox emoji="raise_hand" title={t.alerts.requests}>
        {!requests.length ? (
          <p className="text-muted">{t.alerts.noRequests}</p>
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
                <span className="font-semibold">{t.worker.askNeeds[r.need]}</span>
                <span>{r.place}</span>
                {r.work && <span className="text-sm text-muted">{t.form.works[r.work as keyof typeof t.form.works] ?? r.work}</span>}
                <span className="ml-auto text-sm text-muted tabular">
                  {clockTime(new Date(r.createdAt), lang)}, {clockDate(new Date(r.createdAt), lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelBox>
    </div>
  )
}

export function SettingsScreen() {
  const { t, lang } = useI18n()
  const { profile, setProfile } = useApp()
  const nav = useNavigate()
  const { search } = useLocation()
  const [cleared, setCleared] = useState(false)
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display text-[28px] font-bold">{t.settings.title}</h1>
      <PanelBox emoji="globe" title={t.settings.language}>
        <div className="flex items-center gap-3">
          <LangSwitch />
          <span className="text-muted">{t.lang[lang]}</span>
        </div>
      </PanelBox>
      {profile && (
        <PanelBox emoji="people" title={t.settings.profile} right={profile.demo ? <DemoTag /> : null}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-semibold text-muted">{t.header.role}</dt>
            <dd>{t.role[profile.role]}</dd>
            {profile.name && (
              <>
                <dt className="font-semibold text-muted">{t.form.name}</dt>
                <dd>{profile.name}</dd>
              </>
            )}
            {profile.orgName && (
              <>
                <dt className="font-semibold text-muted">{t.form.orgName}</dt>
                <dd>{profile.orgName}</dd>
              </>
            )}
            {profile.wards && (
              <>
                <dt className="font-semibold text-muted">{t.form.wards}</dt>
                <dd>{profile.wards}</dd>
              </>
            )}
            {profile.budget != null && (
              <>
                <dt className="font-semibold text-muted">{t.form.budget}</dt>
                <dd className="tabular">₹{profile.budget.toLocaleString('en-IN')}</dd>
              </>
            )}
            {profile.work && (
              <>
                <dt className="font-semibold text-muted">{t.form.work}</dt>
                <dd>{t.form.works[profile.work]}</dd>
              </>
            )}
          </dl>
          {profile.role === 'worker' && (
            <div className="mt-3">
              <span className="label">{t.settings.shift}</span>
              <div className="flex gap-2">
                {(['day', 'night'] as const).map((s) => (
                  <button key={s} type="button" className="chip !py-1" aria-pressed={profile.shift === s} onClick={() => setProfile({ ...profile, shift: s })}>
                    {t.form.shifts[s]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="btn btn-line btn-sm mt-4" onClick={() => nav({ pathname: '/welcome', search })}>
            {t.settings.edit}
          </button>
        </PanelBox>
      )}
      <PanelBox emoji="tools" title={t.settings.clear}>
        <p className="text-sm text-muted">{t.settings.clearD}</p>
        <button
          type="button"
          className="btn btn-line btn-sm mt-3"
          onClick={() => {
            taskStore.clear()
            try {
              for (const k of Object.keys(localStorage)) if (k.startsWith('bm:wx:') || k.startsWith('bm:osm:')) localStorage.removeItem(k)
            } catch {
              /* ignore */
            }
            setCleared(true)
          }}
        >
          {t.settings.clear}
        </button>
        {cleared && <p className="mt-2 text-sm font-semibold" role="status">{t.settings.cleared}</p>}
      </PanelBox>
      <Link to={{ pathname: '/sources', search }} className="btn btn-ghost btn-sm">
        {t.nav.sources}
      </Link>
    </div>
  )
}

export function SourcesScreen() {
  const { t } = useI18n()
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="font-display text-[28px] font-bold">{t.sources.title}</h1>
      <p className="text-muted">{t.sources.intro}</p>
      <section className="panel divide-y divide-line">
        {t.sources.rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 p-4 sm:grid-cols-[12rem_1fr]">
            <div className="font-semibold">{k}</div>
            <div className="text-sm">{v}</div>
          </div>
        ))}
      </section>
      <div className="panel p-4">
        <h2 className="mb-2 font-display text-lg font-bold">{t.sources.labels}</h2>
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
          {t.sources.labelList.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <DemoTag label={k} />
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="panel p-4">
        <h2 className="mb-2 font-display text-lg font-bold">{t.today.rules}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {t.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="panel p-4">
        <h2 className="mb-2 font-display text-lg font-bold">{t.sources.roadmap}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {t.sources.roadmapItems.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function NotFound() {
  const { t } = useI18n()
  const { search } = useLocation()
  return (
    <div className="panel p-8 text-center">
      <p className="text-lg">{t.app.notFound}</p>
      <Link to={{ pathname: '/', search }} className="btn btn-ink mt-4">
        {t.app.goHome}
      </Link>
    </div>
  )
}
