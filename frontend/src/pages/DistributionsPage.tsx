import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { distributionsApi, type Distribution } from '@/api/distributions'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

const statusVariant = {
  pending: 'warning',
  confirmed: 'success',
  discrepancy: 'danger',
} as const

const columns = [
  { key: 'id', header: 'ID', render: (d: Distribution) => `#${d.id}` },
  { key: 'status', header: 'Status', render: (d: Distribution) => <Badge variant={statusVariant[d.status]}>{d.status}</Badge> },
  { key: 'distributed_at', header: 'Date', render: (d: Distribution) => new Date(d.distributed_at).toLocaleDateString() },
  { key: 'confirmed_at', header: 'Confirmed', render: (d: Distribution) => d.confirmed_at ? new Date(d.confirmed_at).toLocaleDateString() : '—' },
  { key: 'actions', header: '', render: (d: Distribution) =>
    d.status === 'pending'
      ? <Link to={`/distributions/${d.id}/confirm`} className="text-primary-600 hover:underline text-xs">Confirm</Link>
      : null
  },
]

export default function DistributionsPage() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['distributions'],
    queryFn: () => distributionsApi.list().then(r => r.data),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Distributions</h1>
        {(user?.role === 'admin' || user?.role === 'store_keeper') && (
          <Link
            to="/distributions/new"
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus size={16} /> New Distribution
          </Link>
        )}
      </div>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No distributions yet." />
    </div>
  )
}
