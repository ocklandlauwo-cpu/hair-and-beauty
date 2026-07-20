import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { stockApi, MOVEMENT_META } from '@/api/stock'
import Badge from '@/components/ui/Badge'

export default function StockMovementHistoryPage() {
  const { productId, locationId } = useParams<{ productId: string; locationId: string }>()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['stock-movements-history', productId, locationId, page],
    queryFn: () => stockApi.movementsHistory(Number(productId), Number(locationId), page).then(r => r.data),
  })

  return (
    <div className="space-y-4">
      <div>
        <Link to="/stock" className="text-sm text-primary-600 hover:underline">
          ← Back to Stock
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">
          Movement History
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {data ? `${data.meta.product_name ?? '—'} at ${data.meta.location_name ?? '—'}` : 'Loading…'}
        </p>
      </div>

      {data && (
        <p className="text-sm text-gray-500">
          {data.meta.total} movement{data.meta.total !== 1 ? 's' : ''}
        </p>
      )}

      {isLoading && (
        <p className="text-sm text-gray-400">Loading…</p>
      )}

      {!isLoading && data?.data.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">No movements recorded for this product at this shop.</p>
        </div>
      )}

      {!isLoading && data && data.data.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-right font-medium">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.data.map(m => {
                  const meta = MOVEMENT_META[m.movement_type]
                  const isIncrease = meta.increase === null ? m.quantity > 0 : meta.increase
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-600">
                        {new Date(m.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={isIncrease ? 'success' : 'danger'}>{meta.label}</Badge>
                      </td>
                      <td className={`px-5 py-3 text-right font-semibold ${isIncrease ? 'text-green-600' : 'text-red-500'}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {data.meta.current_page} of {data.meta.last_page}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              disabled={page === data.meta.last_page}
              onClick={() => setPage(p => p + 1)}
              className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
