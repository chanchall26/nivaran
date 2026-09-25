import { useEffect, useRef, useState } from 'react'

/**
 * The place, shown like an Indian Railways station name board: Hindi on top, English below,
 * height above sea level small underneath. When the place changes each whole line flips once
 * (never splitting Hindi letters); reduced motion cross-fades instead (see index.css).
 */
export function StationBoard({ hi, en, small, size = 'md' }: { hi: string; en: string; small?: string; size?: 'sm' | 'md' | 'lg' }) {
  const key = `${hi}|${en}`
  // no flip while the page is still opening (a shared link resolves its place then)
  const [born] = useState(() => Date.now())
  const first = useRef(true)
  const [flip, setFlip] = useState(0)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (Date.now() - born > 2500) setFlip((n) => n + 1)
  }, [key, born])

  const dims =
    size === 'lg'
      ? { box: 'px-6 py-3 min-w-[16rem]', hi: 'text-3xl', en: 'text-2xl', small: 'text-sm' }
      : size === 'sm'
        ? { box: 'px-2.5 py-1 min-w-[8rem] max-w-[11rem]', hi: 'text-[15px]', en: 'text-[13px]', small: 'text-[10px]' }
        : { box: 'px-3.5 py-1.5 min-w-[11rem] max-w-[17rem]', hi: 'text-lg', en: 'text-base', small: 'text-[11px]' }
  const anim = flip ? 'board-flip' : ''
  return (
    <div className={`board ${dims.box}`} aria-label={`${en} (${hi})${small ? `. ${small}` : ''}`} role="img">
      <span key={`h${flip}`} className={`board-line ${anim} ${dims.hi}`} lang="hi" aria-hidden>
        {hi}
      </span>
      <span key={`e${flip}`} className={`board-line ${anim} ${dims.en}`} style={{ animationDelay: flip ? '70ms' : undefined }} aria-hidden>
        {en}
      </span>
      {small && (
        <span key={`s${flip}`} className={`board-line ${anim} ${dims.small} font-semibold`} style={{ animationDelay: flip ? '140ms' : undefined }} aria-hidden>
          {small}
        </span>
      )}
    </div>
  )
}
