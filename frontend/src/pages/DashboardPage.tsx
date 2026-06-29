import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { newsApi } from '@/api/news'
import { useAuth } from '@/contexts/AuthContext'
import StatCard from '@/components/ui/StatCard'

function formatTzs(value: string | number) {
  return `TZS ${Number(value).toLocaleString('en-US')}`
}

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

      {/* Admin dashboard */}
      {dashData?.role === 'admin' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="Sales Today" value={formatTzs(dashData.sales.today)} />
          <StatCard label="Sales This Month" value={formatTzs(dashData.sales.this_month)} />
          <StatCard label="Expenses This Month" value={formatTzs(dashData.expenses.this_month)} />
          <StatCard label="Pending Distributions" value={dashData.distributions.pending} />
          <StatCard label="Expiry Alerts" value={dashData.stock.expiry_alerts} sub="batches expiring in 60 days" />
          <StatCard label="Low Stock Alerts" value={dashData.stock.low_stock_alerts} sub="< 30 days cover" />
        </div>
      )}

      {/* Store-keeper dashboard */}
      {dashData?.role === 'store_keeper' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="Pending Distributions" value={dashData.distributions.pending} />
          <StatCard label="Distributions This Week" value={dashData.distributions.this_week} />
          <StatCard label="Purchases This Month" value={dashData.purchases.this_month_count} />
          <StatCard label="Expiry Alerts" value={dashData.stock.expiry_alerts} />
          <StatCard label="Low Stock Alerts" value={dashData.stock.low_stock_alerts} />
        </div>
      )}

      {/* Seller dashboard */}
      {dashData?.role === 'seller' && (
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Sales Today" value={formatTzs(dashData.sales_today)} sub={`${dashData.sales_count_today} transactions`} />
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

      {/* News feed */}
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
