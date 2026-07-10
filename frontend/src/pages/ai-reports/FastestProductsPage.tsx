import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { aiReportsApi, type TopClientsPeriod } from '@/api/aiReports'

const PERIODS: { value: TopClientsPeriod; label: string }[] = [
  { value: 'all',   label: 'All Time' },
  { value: '30d',   label: 'Last 30 Days' },
  { value: '90d',   label: 'Last 90 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'year',  label: 'This Year' },
]

function fmt(value: string | number) {
  return Number(value).toLocaleString('en-US')
}

const MEDAL: Record<number, { emoji: string; bg: string; text: string }> = {
  1: { emoji: '🥇', bg: 'bg-yellow-50',  text: 'text-yellow-700' },
  2: { emoji: '🥈', bg: 'bg-gray-100',   text: 'text-gray-600'   },
  3: { emoji: '🥉', bg: 'bg-orange-50',  text: 'text-orange-600' },
}

function StockBadge({ currentStock, daysLeft }: { currentStock: number; daysLeft: number | null }) {
  if (currentStock === 0) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Out of stock</span>
  }
  if (daysLeft === null) {
    return <span className="text-xs text-gray-400">—</span>
  }
  const className =
    daysLeft < 7  ? 'bg-red-100 text-red-600' :
    daysLeft < 14 ? 'bg-amber-100 text-amber-700' :
    'bg-gray-100 text-gray-600'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>{daysLeft}d</span>
}

export default function FastestProductsPage() {
  const [period, setPeriod] = useState<TopClientsPeriod>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['ai-reports', 'fastest-products', period],
    queryFn: () => aiReportsApi.fastestProducts(period).then(r => r.data.data),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Fastest Selling Products</h1>
          <p className="mt-1 text-sm text-gray-500">
            Products ranked by sales velocity (units/day). Top 50 shown, with stock runway.
          </p>
        </div>

        <select
          value={period}
          onChange={e => setPeriod(e.target.value as TopClientsPeriod)}
          className="rounded-lg border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600 bg-white"
        >
          {PERIODS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <p className="text-sm text-gray-400">Loading…</p>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">No sales found for this period.</p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
                  <th className="px-4 py-3 text-center font-medium w-12">#</th>
                  <th className="px-4 py-3 text-left font-medium">Product</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Units Sold</th>
                  <th className="px-4 py-3 text-right font-medium">Velocity (units/day)</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue (TZS)</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 text-right font-medium">Days Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.map((product, index) => {
                  const rank = index + 1
                  const medal = MEDAL[rank]

                  return (
                    <tr key={product.product_id} className={`hover:bg-gray-50 transition-colors ${medal ? medal.bg : ''}`}>
                      <td className="px-4 py-3 text-center">
                        {medal
                          ? <span className="text-lg">{medal.emoji}</span>
                          : <span className="text-xs font-semibold text-gray-400">{rank}</span>
                        }
                      </td>
                      <td className={`px-4 py-3 font-semibold ${medal ? medal.text : 'text-gray-800'}`}>
                        {product.product_name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{product.category_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{product.units_sold}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(product.velocity)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(product.revenue)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{product.current_stock}</td>
                      <td className="px-4 py-3 text-right">
                        <StockBadge currentStock={product.current_stock} daysLeft={product.days_of_stock_left} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
