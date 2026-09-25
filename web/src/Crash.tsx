/**
 * Last line of defence: if any screen throws, show a way out instead of a blank page.
 * "Try again" re-renders; "Clear saved data" removes this device's saved app data (not the
 * language) and reloads, which fixes a crash caused by old or damaged saved data.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from './i18n'

function Fallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  const reset = () => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('bm:') && k !== 'bm:lang') localStorage.removeItem(k)
    } catch {
      /* storage blocked */
    }
    location.assign('/')
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
      <h1 className="font-display text-2xl font-bold">{t.app.crashTitle}</h1>
      <p className="text-muted">{t.app.crashBody}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-ink" onClick={onRetry}>
          {t.app.tryAgain}
        </button>
        <button type="button" className="btn btn-line" onClick={reset}>
          {t.app.crashReset}
        </button>
      </div>
      <p className="text-sm font-semibold">{t.worker.emergency}</p>
    </main>
  )
}

export class CrashGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Barahmasa screen error', error, info.componentStack)
  }
  render() {
    return this.state.failed ? <Fallback onRetry={() => this.setState({ failed: false })} /> : this.props.children
  }
}
