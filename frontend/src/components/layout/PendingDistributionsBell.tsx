import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { distributionsApi } from '@/api/distributions'
import { useAuth } from '@/contexts/AuthContext'

export default function PendingDistributionsBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Key under ['distributions'] so existing create/confirm/cancel invalidations refresh the bell
  const { data } = useQuery({
    queryKey: ['distributions', 'pending'],
    queryFn: () => distributionsApi.pending().then(r => r.data),
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const count = data?.count ?? 0
  const pending = data?.data ?? []
  const isSeller = user?.role === 'seller'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative rounded-lg p-1.5 text-gray-500 hover:bg-warm-50 hover:text-gray-800 transition-colors"
        aria-label={`Pending distributions (${count})`}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-warm-100 bg-white shadow-lg">
          <div className="border-b border-warm-100 px-4 py-2.5 text-sm font-semibold text-gray-800">
            Pending distributions ({count})
          </div>
          {pending.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Nothing waiting for verification.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {pending.map(d => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{d.to_location_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(d.distributed_at).toLocaleDateString()} · {d.items_count} item{d.items_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  {isSeller && (
                    <Link
                      to={`/distributions/${d.id}/confirm`}
                      onClick={() => setOpen(false)}
                      className="shrink-0 rounded-md bg-primary-600 px-3 h-8 flex items-center text-xs font-medium text-white hover:bg-primary-700"
                    >
                      Verify
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/distributions?status=pending"
            onClick={() => setOpen(false)}
            className="block border-t border-warm-100 px-4 py-2.5 text-center text-sm font-medium text-primary-600 hover:bg-warm-50"
          >
            View pending distributions
          </Link>
        </div>
      )}
    </div>
  )
}
