import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import { ICON } from './atoms'

/** Side sheet on desktop, bottom sheet on phone. Esc and the scrim close it; focus moves inside. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    // a real control first; else the close button (never a source tooltip, which would pop open)
    const first = box.current?.querySelector<HTMLElement>('input, button:not([data-close])') ?? box.current?.querySelector<HTMLElement>('[data-close]')
    first?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-stretch sm:justify-end">
      <div className="scrim absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-paper sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-l sm:border-line"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button type="button" data-close className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t.app.close}>
            <X className="size-5" {...ICON} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
