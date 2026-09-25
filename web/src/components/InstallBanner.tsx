import { Download, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { BrandMark } from './Brand'
import { Btn } from './kit'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const KEY = 'barahmasa:installDismissed'

/** "Add to home screen" card (when the browser allows it) and an offline strip. */
export function InstallBanner() {
  const { s } = useI18n()
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* not remembered */
    }
  }

  return (
    <>
      {!online && (
        <div className="relative z-30 flex items-center justify-center gap-2 bg-ink px-4 py-1.5 text-sm font-semibold text-bg" role="status">
          <WifiOff className="size-4" aria-hidden /> {s.install.offline}
        </div>
      )}
      {evt && !dismissed && (
        <div className="glass anim-rise fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-3xl p-3.5 xl:bottom-6" role="dialog" aria-label={s.install.title}>
          <BrandMark size={44} />
          <div className="min-w-0 flex-1">
            <div className="font-display font-extrabold">{s.install.title}</div>
            <p className="text-xs text-ink-2">{s.install.text}</p>
          </div>
          <Btn
            size="sm"
            onClick={async () => {
              await evt.prompt()
              await evt.userChoice
              setEvt(null)
            }}
          >
            <Download className="size-4" /> {s.install.button}
          </Btn>
          <button type="button" onClick={dismiss} className="rounded-xl p-1 text-ink-3" aria-label={s.install.later}>
            <X className="size-5" />
          </button>
        </div>
      )}
    </>
  )
}
