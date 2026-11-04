import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { stockApi } from '@/api/stock'
import { useAuth } from '@/contexts/AuthContext'
import NotificationMenu from './NotificationMenu'

export default function LowStockBell() {
  const { user } = useAuth()

  // Same key as the Stock page's Low Stock tab so both share one cache entry
  const { data = [] } = useQuery({
    queryKey: ['stock-low'],
    queryFn: () => stockApi.lowStockAlerts().then(r => r.data.data),
    refetchInterval: 5 * 60_000,
  })

  // Per-shop counts for users who see more than one shop
  const byShop = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of data) counts.set(r.location_name, (counts.get(r.location_name) ?? 0) + 1)
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [data])

  const showShop = user?.role !== 'seller'

  return (
    <NotificationMenu
      icon={AlertTriangle}
      title="Low stock products"
      count={data.length}
      emptyMessage="No products are running low."
      footerTo="/stock?tab=low"
      footerLabel="View low stock products"
    >
      {() => (
        <>
          {showShop && byShop.length > 1 && (
            <li className="flex flex-wrap gap-1.5 px-4 py-2.5">
              {byShop.map(([shop, n]) => (
                <span key={shop} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  {shop}: {n}
                </span>
              ))}
            </li>
          )}
          {data.map(r => (
            <li key={`${r.product_id}-${r.location_id}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{r.product_name}</p>
                {showShop && <p className="truncate text-xs text-gray-500">{r.location_name}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-gray-900">{r.current_stock} left</p>
                <p className="text-xs text-red-600">{r.days_of_cover ?? 0} days cover</p>
              </div>
            </li>
          ))}
        </>
      )}
    </NotificationMenu>
  )
}
