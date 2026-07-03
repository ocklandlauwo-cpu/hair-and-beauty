import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { purchasesApi, type Purchase, type PurchaseDetail } from '@/api/purchases'
import { useAuth } from '@/contexts/AuthContext'

function fmt(n: number) {
  return Number(n).toLocaleString('en-US')
}

function PurchaseItems({ id }: { id: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => purchasesApi.show(id).then(r => r.data.data as PurchaseDetail),
  })

  if (isLoading) return <p className="px-4 py-3 text-sm text-gray-400">Loading…</p>
  if (!data?.items?.length) return <p className="px-4 py-3 text-sm text-gray-400">No items.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-500 bg-gray-50">
          <th className="px-4 py-2 text-left font-medium">Product</th>
          <th className="px-4 py-2 text-right font-medium">Qty</th>
          <th className="px-4 py-2 text-right font-medium">Unit Cost (TZS)</th>
          <th className="px-4 py-2 text-right font-medium">Line Total (TZS)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {data.items.map(item => (
          <tr key={item.id}>
            <td className="px-4 py-2 text-gray-800">{item.product_name}</td>
            <td className="px-4 py-2 text-right text-gray-600">{item.quantity}</td>
            <td className="px-4 py-2 text-right text-gray-600">{fmt(Number(item.unit_cost))}</td>
            <td className="px-4 py-2 text-right font-medium">{fmt(item.line_total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function PurchasesPage() {
  const { user } = useAuth()
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => purchasesApi.list().then(r => r.data),
  })

  const purchases: Purchase[] = data?.data ?? []

  const toggle = (id: number) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Purchases</h1>
        {(user?.role === 'admin' || user?.role === 'store_keeper') && (
          <Link
            to="/purchases/new"
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus size={16} /> Record Purchase
          </Link>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : purchases.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No purchases recorded.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="w-8" />
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Supplier</th>
                <th className="px-4 py-3 text-right font-medium">Total Amount (TZS)</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(p => (
                <>
                  <tr
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="pl-3 text-gray-400">
                      {expandedId === p.id
                        ? <ChevronDown size={14} />
                        : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3 text-gray-500">#{p.id}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {new Date(p.purchase_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.supplier_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {fmt(p.total_amount)}
                    </td>
                  </tr>

                  {expandedId === p.id && (
                    <tr key={`${p.id}-items`} className="bg-gray-50/60">
                      <td colSpan={5} className="border-t border-gray-100">
                        <PurchaseItems id={p.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
