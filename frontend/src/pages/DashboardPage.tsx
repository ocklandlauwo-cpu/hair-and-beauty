import { useQuery } from '@tanstack/react-query'
import { dashboardApi, type ShopBreakdown } from '@/api/dashboard'
import { newsApi } from '@/api/news'
import { stockApi, type SlowStockAlert } from '@/api/stock'
import { useAuth } from '@/contexts/AuthContext'
import StatCard from '@/components/ui/StatCard'

function fmtTzs(value: string | number) {
  return `TZS ${Number(value).toLocaleString('en-US')}`
}

// ── Breakdown card: total + per-shop list ──────────────────────────────────
interface BreakdownCardProps {
  label: string
  total: string
  shops: ShopBreakdown[]
  isCurrency?: boolean
  colorNegative?: boolean
}

function BreakdownCard({ label, total, shops, isCurrency = true, colorNegative = false }: BreakdownCardProps) {
  const totalNum = Number(total)
  const isNeg = colorNegative && totalNum < 0

  return (
    <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm flex flex-col">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-extrabold ${isNeg ? 'text-red-600' : 'text-gray-900'}`}>
        {isCurrency ? fmtTzs(totalNum) : totalNum.toLocaleString('en-US')}
      </p>

      {shops.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
          {shops.map(s => {
            const shopNum = Number(s.total)
            const shopNeg = colorNegative && shopNum < 0
            return (
              <div key={s.location_id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 truncate">{s.location_name}</span>
                <span className={`text-xs font-semibold shrink-0 ${shopNeg ? 'text-red-500' : 'text-gray-700'}`}>
                  {isCurrency ? shopNum.toLocaleString('en-US') : shopNum}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Slow-moving stock widget (admin only) ─────────────────────────────────
function SlowStockWidget({ items }: { items: SlowStockAlert[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
          Slow-Moving Products <span className="normal-case font-normal">(60+ days no sale)</span>
        </p>
        <p className="text-sm text-gray-400">All products moving well — no slow movers.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
          Slow-Moving Products
          <span className="ml-1 normal-case font-normal text-gray-400">(60+ days no sale)</span>
        </p>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
          {items.length} product{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 text-left font-medium">Product</th>
              <th className="pb-2 text-left font-medium">Category</th>
              <th className="pb-2 text-right font-medium">Stock</th>
              <th className="pb-2 text-right font-medium">Days Idle</th>
              <th className="pb-2 text-right font-medium">Price (TZS)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(item => (
              <tr key={item.product_id} className="hover:bg-gray-50">
                <td className="py-2 pr-4 font-medium text-gray-800">{item.product_name}</td>
                <td className="py-2 pr-4 text-gray-500 text-xs">{item.category_name ?? '—'}</td>
                <td className="py-2 text-right text-gray-700">{item.total_stock}</td>
                <td className="py-2 text-right">
                  {item.days_since_last_sale === null
                    ? <span className="text-red-500 font-semibold">Never sold</span>
                    : <span className={item.days_since_last_sale >= 90 ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold'}>
                        {item.days_since_last_sale}d
                      </span>
                  }
                </td>
                <td className="py-2 text-right text-gray-700">
                  {Number(item.retail_price).toLocaleString('en-US')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then(r => r.data.data),
  })

  const { data: newsData } = useQuery({
    queryKey: ['news'],
    queryFn: () => newsApi.list().then(r => r.data),
  })

  const isAdmin = user?.role === 'admin'

  const { data: slowStockData } = useQuery({
    queryKey: ['stock-slow'],
    queryFn: () => stockApi.slowStockAlerts().then(r => r.data.data),
    enabled: isAdmin,
  })

  if (dashLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading dashboard…</div>
  }

  const news = newsData?.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Welcome, {user?.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500 capitalize">
          {user?.role?.replace('_', ' ')} dashboard
        </p>
      </div>

      {/* ── Admin dashboard ─────────────────────────────────────────── */}
      {dashData?.role === 'admin' && (
        <div className="space-y-4">
          {/* Sales + Profit breakdown cards (2 col) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BreakdownCard
              label="Sales Today"
              total={dashData.sales.today}
              shops={dashData.sales.today_by_shop}
            />
            <BreakdownCard
              label="Sales This Month"
              total={dashData.sales.this_month}
              shops={dashData.sales.this_month_by_shop}
            />
            <BreakdownCard
              label="Profit Today"
              total={dashData.profit.today}
              shops={dashData.profit.today_by_shop}
              colorNegative
            />
            <BreakdownCard
              label="Profit This Month"
              total={dashData.profit.this_month}
              shops={dashData.profit.this_month_by_shop}
              colorNegative
            />
            <BreakdownCard
              label="Expenses This Month"
              total={dashData.expenses.this_month}
              shops={dashData.expenses.this_month_by_shop}
            />
          </div>

          {/* Simple count cards (3 col) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Pending Distributions" value={dashData.distributions.pending} />
            <StatCard label="Expiry Alerts" value={dashData.stock.expiry_alerts} sub="batches expiring in 60 days" />
            <StatCard label="Low Stock Alerts" value={dashData.stock.low_stock_alerts} sub="< 30 days cover" />
          </div>

          {/* Slow-moving stock */}
          <SlowStockWidget items={slowStockData ?? []} />
        </div>
      )}

      {/* ── Store-keeper dashboard ──────────────────────────────────── */}
      {dashData?.role === 'store_keeper' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Pending Distributions" value={dashData.distributions.pending} />
          <StatCard label="Distributions This Week" value={dashData.distributions.this_week} />
          <StatCard label="Purchases This Month" value={dashData.purchases.this_month_count} />
          <StatCard label="Expiry Alerts" value={dashData.stock.expiry_alerts} />
          <StatCard label="Low Stock Alerts" value={dashData.stock.low_stock_alerts} />
        </div>
      )}

      {/* ── Seller dashboard ────────────────────────────────────────── */}
      {dashData?.role === 'seller' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Sales Today" value={fmtTzs(dashData.sales_today)} sub={`${dashData.sales_count_today} transactions`} />
          <StatCard
            label="Daily Reconciliation"
            value={dashData.reconciliation_pending ? 'Pending' : 'Submitted'}
          />
          <StatCard label="Low Stock Items" value={dashData.low_stock_count} />
          <StatCard
            label="Attendance"
            value={dashData.attendance_today
              ? (dashData.attendance_today === 'clock_in' ? 'Clocked In' : 'Clocked Out')
              : 'Not recorded'}
          />
        </div>
      )}

      {/* ── News feed ───────────────────────────────────────────────── */}
      {news.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Announcements</h2>
          <div className="space-y-3">
            {news.slice(0, 3).map(item => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-medium text-gray-900">{item.title}</h3>
                <p className="mt-1 text-xs text-gray-500 line-clamp-2">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
