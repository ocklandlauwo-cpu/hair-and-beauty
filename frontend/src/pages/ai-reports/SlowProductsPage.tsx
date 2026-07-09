import { useQuery } from '@tanstack/react-query'
import { stockApi } from '@/api/stock'

export default function SlowProductsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-slow'],
    queryFn: () => stockApi.slowStockAlerts().then(r => r.data.data),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Slow-Moving Products</h1>
        <p className="mt-1 text-sm text-gray-500">
          Products with stock on hand that have not sold in 60 or more days. Consider promotions or price adjustments.
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-gray-400">Loading…</p>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">All products are moving well — no slow movers right now.</p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">
              Products idle for 60+ days
            </p>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              {data.length} product{data.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 text-left font-medium">Product</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 text-right font-medium">Days Idle</th>
                  <th className="px-5 py-3 text-right font-medium">Retail Price (TZS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.map(item => (
                  <tr key={item.product_id} className="hover:bg-amber-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{item.product_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{item.category_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{item.total_stock}</td>
                    <td className="px-4 py-3 text-right">
                      {item.days_since_last_sale === null
                        ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Never sold</span>
                        : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.days_since_last_sale >= 90
                              ? 'bg-red-100 text-red-600'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {item.days_since_last_sale}d
                          </span>
                      }
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {Number(item.retail_price).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
