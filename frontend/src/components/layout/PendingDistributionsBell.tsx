import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { distributionsApi } from '@/api/distributions'
import { useAuth } from '@/contexts/AuthContext'
import NotificationMenu from './NotificationMenu'

export default function PendingDistributionsBell() {
  const { user } = useAuth()

  // Key under ['distributions'] so existing create/confirm/cancel invalidations refresh the bell
  const { data } = useQuery({
    queryKey: ['distributions', 'pending'],
    queryFn: () => distributionsApi.pending().then(r => r.data),
    refetchInterval: 60_000,
  })

  const pending = data?.data ?? []
  const isSeller = user?.role === 'seller'

  return (
    <NotificationMenu
      icon={Bell}
      title="Pending distributions"
      count={data?.count ?? 0}
      emptyMessage="Nothing waiting for verification."
      footerTo="/distributions?status=pending"
      footerLabel="View pending distributions"
    >
      {close => pending.map(d => (
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
              onClick={close}
              className="shrink-0 rounded-md bg-primary-600 px-3 h-8 flex items-center text-xs font-medium text-white hover:bg-primary-700"
            >
              Verify
            </Link>
          )}
        </li>
      ))}
    </NotificationMenu>
  )
}
