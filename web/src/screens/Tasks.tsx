import { Camera, Check, Flame, PhoneCall, Volume2, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../ctx'
import { useI18n } from '../i18n'
import { taskState } from '../lib/checks'
import { hourLabel } from '../lib/ist'
import { HELP } from '../lib/plan'
import {
  FAIL_REASONS, needsPrecheck, precheckDone, SIGNALS, taskStore, useDb, type FailReason, type Precheck, type Signal, type Task,
} from '../lib/tasks'
import { ICON } from '../ui/atoms'
import { Emoji } from '../ui/Emoji'
import { useNow } from '../ui/Header'
import { DueList, PanelBox, StateLine, useColdNightAt } from './panels'
import { useHelp } from './shared'

/** Shrink a photo to a small JPEG so it fits in local storage. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 480 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * s)
      c.height = Math.round(img.height * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL('image/jpeg', 0.6))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/** The Pulse question, spoken in Hindi. Asks "what time", not "did it run", and promises nothing is taken back. */
const HINDI_QUESTION = 'नमस्ते, बारहमासा से बात हो रही है। कल रात हीटर कितने बजे चलाया? आपके जवाब से हीटर वापस नहीं लिया जाएगा।'
function speakHindi() {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(HINDI_QUESTION)
  u.lang = 'hi-IN'
  const v = speechSynthesis.getVoices().find((x) => x.lang.replace('_', '-').startsWith('hi'))
  if (v) u.voice = v
  u.rate = 0.9
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

function PrecheckBox({ task }: { task: Task }) {
  const { t } = useI18n()
  const p: Precheck = task.precheck ?? { socket: false, bill: false, guard: '' }
  const set = (patch: Partial<Precheck>) => taskStore.update(task.id, { precheck: { ...p, ...patch } })
  return (
    <fieldset className="mt-2 rounded-lg border border-line p-3">
      <legend className="px-1 text-sm font-semibold">{t.tasks.pre}</legend>
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" className="size-4 accent-[#1b2330]" checked={p.socket} onChange={(e) => set({ socket: e.target.checked })} />
        <span className="text-sm">{t.tasks.preSocket}</span>
      </label>
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" className="size-4 accent-[#1b2330]" checked={p.bill} onChange={(e) => set({ bill: e.target.checked })} />
        <span className="text-sm">{t.tasks.preBill}</span>
      </label>
      <label className="mt-1 block">
        <span className="text-sm">{t.tasks.preGuard}</span>
        <input className="field mt-1 !min-h-9 !py-1" value={p.guard} onChange={(e) => set({ guard: e.target.value })} autoComplete="off" />
      </label>
      {!precheckDone(p) && <p className="mt-2 text-xs font-semibold text-muted">{t.tasks.preNeed}</p>}
    </fieldset>
  )
}

const RAN_HOURS = [20, 21, 22, 23]

function PulseBox({ task, onDone }: { task: Task; onDone: () => void }) {
  const { t, lang } = useI18n()
  const [signal, setSignal] = useState<Signal>('call')
  const [failing, setFailing] = useState(false)
  const heater = task.help === 'heater' || task.help === 'socket_fix'
  const record = (ok: boolean, o: { reason?: FailReason; ranFrom?: number } = {}) => {
    taskStore.record(task.id, { signal, ok, ...o })
    onDone()
  }
  return (
    <div className="mt-2 space-y-3 rounded-lg bg-mist p-3">
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t.tasks.how}</legend>
        <div className="flex flex-wrap gap-1.5">
          {SIGNALS.map((s) => (
            <button key={s} type="button" className="chip !py-1" aria-pressed={signal === s} onClick={() => setSignal(s)}>
              {t.tasks.signals[s]}
            </button>
          ))}
        </div>
        {signal === 'plug' && <p className="mt-1 text-xs text-muted">{t.tasks.plugNote}</p>}
      </fieldset>
      {heater && signal === 'call' && (
        <div className="rounded-lg border border-line bg-paper p-3">
          <div className="text-xs font-semibold text-muted">{t.tasks.script}</div>
          <p className="font-semibold" lang="hi">
            {HINDI_QUESTION}
          </p>
          {lang === 'en' && <p className="text-sm text-muted">{t.tasks.question} {t.tasks.promise}</p>}
          <button type="button" className="btn btn-line btn-sm mt-2" onClick={speakHindi}>
            <Volume2 className="size-4" {...ICON} aria-hidden /> {t.tasks.play}
          </button>
        </div>
      )}
      {!failing ? (
        heater ? (
          <div>
            <div className="mb-1 text-sm font-semibold">{t.tasks.ranAt}</div>
            <div className="flex flex-wrap gap-2">
              {RAN_HOURS.map((h) => (
                <button key={h} type="button" className="btn btn-sm text-white" style={{ background: '#157a45' }} onClick={() => record(true, { ranFrom: h })}>
                  <Check className="size-4" {...ICON} aria-hidden /> {hourLabel(h, lang)}
                </button>
              ))}
              <button type="button" className="btn btn-sm text-white" style={{ background: '#157a45' }} onClick={() => record(true, { ranFrom: 0 })}>
                {t.tasks.after12}
              </button>
              <button type="button" className="btn btn-sm text-white" style={{ background: '#b01f33' }} onClick={() => setFailing(true)}>
                <X className="size-4" {...ICON} aria-hidden /> {t.tasks.notRun}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm text-white" style={{ background: '#157a45' }} onClick={() => record(true)}>
              <Check className="size-4" {...ICON} aria-hidden /> {t.tasks.worked}
            </button>
            <button type="button" className="btn btn-sm text-white" style={{ background: '#b01f33' }} onClick={() => setFailing(true)}>
              <X className="size-4" {...ICON} aria-hidden /> {t.tasks.didnt}
            </button>
          </div>
        )
      ) : (
        <fieldset>
          <legend className="mb-2 font-semibold">{t.tasks.whyNot}</legend>
          <div className="flex flex-wrap gap-2">
            {FAIL_REASONS.map((r) => (
              <button key={r} type="button" className="chip !py-1.5" onClick={() => record(false, { reason: r })}>
                {t.checks.reasons[r]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}

/** A saved answer moves the task to "Done", so the confirmation lives on the page, not the row. */
function TaskRow({ task, onSaved }: { task: Task; onSaved: (msg: string) => void }) {
  const { t, lang } = useI18n()
  const help = useHelp()
  const coldNightAt = useColdNightAt()
  const now = useNow(60_000).getTime()
  const [checking, setChecking] = useState(false)
  const where = lang === 'hi' ? task.pointNameHi || task.pointName : task.pointName
  const pre = needsPrecheck(task.help)
  const canDeliver = !pre || precheckDone(task.precheck)
  const st = taskState(task, help.checks, help.fires, now, { coldNightAt })
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {t.schemes.names[task.help]} <span className="font-normal text-muted">× {task.qty}</span>
          </div>
          <div className="text-sm text-muted">{where}</div>
          {task.status !== 'planned' && <StateLine st={st} />}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${task.status === 'failed' ? 'bg-[#b01f33] text-white' : task.status === 'working' ? 'bg-[#157a45] text-white' : 'bg-mist'}`}>
          {t.schemes.status[task.status]}
          {task.reason ? ` · ${t.checks.reasons[task.reason]}` : ''}
        </span>
      </div>
      {task.photo && <img src={task.photo} alt="" className="mt-2 h-20 rounded-md border border-line object-cover" />}
      {task.status === 'planned' && pre && <PrecheckBox task={task} />}
      <div className="mt-2 flex flex-wrap gap-2">
        {task.status === 'planned' && (
          <>
            <button type="button" className="btn btn-ink btn-sm" disabled={!canDeliver} onClick={() => taskStore.deliver(task.id)}>
              <Check className="size-4" {...ICON} aria-hidden /> {t.tasks.markDelivered}
            </button>
            <label className="btn btn-line btn-sm cursor-pointer">
              <Camera className="size-4" {...ICON} aria-hidden /> {task.photo ? t.tasks.photoAdded : t.tasks.addPhoto}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) taskStore.update(task.id, { photo: await shrink(file).catch(() => undefined) })
                }}
              />
            </label>
          </>
        )}
        {task.status !== 'planned' && !checking && (
          <button type="button" className="btn btn-line btn-sm" onClick={() => setChecking(true)}>
            <PhoneCall className="size-4" {...ICON} aria-hidden /> {t.tasks.callCheck}
          </button>
        )}
        {task.status !== 'planned' && (task.help === 'heater' || task.help === 'socket_fix') && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (taskStore.reportFire(task.pointId), onSaved(t.fire.reported))}>
            <Flame className="size-4" {...ICON} aria-hidden /> {t.tasks.reportFire}
          </button>
        )}
      </div>
      {checking && <PulseBox task={task} onDone={() => (setChecking(false), onSaved(t.tasks.saved))} />}
    </li>
  )
}

export default function Tasks() {
  const { t } = useI18n()
  const { pts } = useApp()
  const { tasks } = useDb()
  const [msg, setMsg] = useState<string | null>(null)
  const open = tasks.filter((x) => x.status === 'planned' || x.status === 'delivered')
  const done = tasks.filter((x) => x.status === 'working' || x.status === 'failed')
  // demo shortcut: without an officer's plan, give the partner a few real tasks to try
  const seed = () => {
    const ps = (pts.points ?? []).filter((p) => p.people.some((c) => c.shift === 'night' && c.group === 'guard')).slice(0, 4)
    taskStore.addTasks(
      ps.map((p, i) => {
        const help = i % 2 === 0 ? (p.heater && p.heater !== 'none' ? 'socket_fix' : 'heater') : 'warm_kit'
        const n = p.people.filter((c) => c.shift === 'night').reduce((a, c) => a + c.count, 0)
        const qty = help === 'warm_kit' ? n : 1
        return {
          pointId: p.id, pointName: p.name, pointNameHi: p.nameHi, lat: p.lat, lon: p.lon, help, qty,
          cost: qty * HELP[help].cost, people: n, shiftHours: 12,
        }
      }),
    )
  }
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[28px] font-bold">{t.tasks.title}</h1>
      <p className="min-h-6 font-semibold text-[#14663b]" role="status">
        {msg}
      </p>
      {tasks.length > 0 && (
        <PanelBox title={t.checks.due}>
          <DueList tasks={tasks} />
        </PanelBox>
      )}
      <PanelBox title={`${t.tasks.open} (${open.length})`}>
        {open.length ? (
          <ul className="divide-y divide-line">
            {open.map((x) => (
              <TaskRow key={x.id} task={x} onSaved={setMsg} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center py-6 text-center">
            <Emoji name="package" size={72} float />
            <p className="mt-3 max-w-md text-muted">{t.tasks.empty}</p>
            {!tasks.length && (pts.points?.length ?? 0) > 0 && (
              <button type="button" className="btn btn-line btn-sm mt-3" onClick={seed}>
                {t.entry.tryDemo}
              </button>
            )}
          </div>
        )}
      </PanelBox>
      {done.length > 0 && (
        <PanelBox title={`${t.tasks.done} (${done.length})`}>
          <ul className="divide-y divide-line">
            {done.map((x) => (
              <TaskRow key={x.id} task={x} onSaved={setMsg} />
            ))}
          </ul>
        </PanelBox>
      )}
    </div>
  )
}
