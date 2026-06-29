import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { purchasesApi, type Purchase } from '@/api/purchases'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'

const columns = [
  { key: 'id', header: '#', render: (p: Purchase) => `#${p.id}` },
  { key: 'purchase_date', header: 'Date', render: (p: Purchase) => new Date(p.purchase_date).toLocaleDateString() },
  { key: 'supplier_name', header: 'Supplier', render: (p: Purchase) => p.supplier_name ?? '—' },
  { key: 'invoice_number', header: 'Invoice', render: (p: Purchase) => p.invoice_number ?? '—' },
]

export default function PurchasesPage() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: ['purchases'], queryFn: () => purchasesApi.list().then(r => r.data) })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Purchases</h1>
        {(user?.role === 'admin' || user?.role === 'store_keeper') && (
          <Link to="/purchases/new" className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700">
            <Plus size={16} /> Record Purchase
          </Link>
        )}
      </div>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No purchases recorded." />
    </div>
  )
}
