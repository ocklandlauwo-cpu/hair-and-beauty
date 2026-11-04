import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

interface NotificationMenuProps {
  icon: LucideIcon
  title: string
  count: number
  emptyMessage: string
  footerTo: string
  footerLabel: string
  /** Rows to render; receives a callback that closes the menu (for links inside rows). */
  children: (close: () => void) => ReactNode
}

/** Header icon button with a red count badge and a dropdown panel. */
export default function NotificationMenu({ icon: Icon, title, count, emptyMessage, footerTo, footerLabel, children }: NotificationMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative rounded-lg p-1.5 text-gray-500 hover:bg-warm-50 hover:text-gray-800 transition-colors"
        aria-label={`${title} (${count})`}
      >
        <Icon size={20} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-warm-100 bg-white shadow-lg">
          <div className="border-b border-warm-100 px-4 py-2.5 text-sm font-semibold text-gray-800">
            {title} ({count})
          </div>
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">{emptyMessage}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {children(close)}
            </ul>
          )}
          <Link
            to={footerTo}
            onClick={close}
            className="block border-t border-warm-100 px-4 py-2.5 text-center text-sm font-medium text-primary-600 hover:bg-warm-50"
          >
            {footerLabel}
          </Link>
        </div>
      )}
    </div>
  )
}
