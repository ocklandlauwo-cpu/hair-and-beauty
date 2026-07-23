import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus, History, TrendingUp } from 'lucide-react'
import { purchasesApi, type Purchase, type PurchaseDetail, type ForecastRow } from '@/api/purchases'
import { locationsApi } from '@/api/locations'
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

// ── Forecast Tab ─────────────────────────────────────────────────────────
function ForecastTab() {
  const [locationId, setLocationId] = useState('')
  const [months, setMonths] = useState('3')

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['purchase-forecast', locationId, months],
    queryFn: () => purchasesApi.forecast(Number(locationId), Number(months)).then(r => r.data.data),
    enabled: !!locationId,
  })

  const shops = (locations ?? []).filter(l => l.type === 'shop' && l.is_active)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={locationId}
          onChange={e => setLocationId(e.target.value)}
          className="h-9 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        >
          <option value="">Select shop…</option>
          {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select
          value={months}
          onChange={e => setMonths(e.target.value)}
          className="h-9 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        >
          {Array.from({ length: 11 }, (_, i) => i + 2).map(m => (
            <option key={m} value={m}>{m} month{m !== 1 ? 's' : ''}</option>
          ))}
        </select>
      </div>

      {!locationId && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">Select a shop to see its purchase forecast.</p>
        </div>
      )}

      {locationId && (isLoading || isFetching) && (
        <p className="text-sm text-gray-400">Loading…</p>
      )}

      {locationId && !isLoading && !isFetching && data && data.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">No active products found.</p>
        </div>
      )}

      {locationId && !isLoading && !isFetching && data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Buying Price (TZS)</th>
                <th className="px-4 py-3 text-right font-medium">Avg Daily Sales</th>
                <th className="px-4 py-3 text-right font-medium">Current Stock</th>
                <th className="px-4 py-3 text-right font-medium">Projected Need</th>
                <th className="px-4 py-3 text-right font-medium">Suggested Purchase Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row: ForecastRow) => (
                <tr key={row.product_id}>
                  <td className="px-4 py-3 text-gray-800">{row.product_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{row.category_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmt(Number(row.latest_cost))}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{Number(row.avg_daily_sales).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.current_stock}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.projected_need}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{row.suggested_purchase_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PurchasesPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'history' | 'forecast'>('history')
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
        {tab === 'history' && (user?.role === 'admin' || user?.role === 'store_keeper') && (
          <Link
            to="/purchases/new"
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus size={16} /> Record Purchase
          </Link>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          ['history',  'History',  History],
          ['forecast', 'Forecast', TrendingUp],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'history' && (
        isLoading ? (
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
        )
      )}

      {tab === 'forecast' && <ForecastTab />}
    </div>
  )
}
