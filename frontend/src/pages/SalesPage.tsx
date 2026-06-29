import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { salesApi, type Sale } from '@/api/sales'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

const columns = [
  { key: 'id', header: '#', render: (s: Sale) => `#${s.id}` },
  { key: 'sale_date', header: 'Date', render: (s: Sale) => new Date(s.sale_date).toLocaleDateString() },
  { key: 'payment_method', header: 'Payment', render: (s: Sale) => <Badge className="uppercase">{s.payment_method}</Badge> },
  { key: 'total_amount', header: 'Total (TZS)', render: (s: Sale) => Number(s.total_amount).toLocaleString('en-US') },
  { key: 'is_reverted', header: 'Status', render: (s: Sale) => s.is_reverted ? <Badge variant="danger">Reverted</Badge> : <Badge variant="success">Completed</Badge> },
]

export default function SalesPage() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: ['sales'], queryFn: () => salesApi.list().then(r => r.data) })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Sales</h1>
        {(user?.role === 'seller' || user?.role === 'admin') && (
          <Link to="/sales/new" className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700">
            <Plus size={16} /> New Sale
          </Link>
        )}
      </div>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No sales yet." />
    </div>
  )
}
