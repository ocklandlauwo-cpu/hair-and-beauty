import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Clock, Package } from 'lucide-react'
import { stockApi, type StockRow, type ExpiryAlert, type LowStockAlert } from '@/api/stock'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

type Tab = 'current' | 'expiry' | 'low'

const currentColumns = [
  { key: 'product_name', header: 'Product' },
  { key: 'location_name', header: 'Location' },
  { key: 'location_type', header: 'Type', render: (r: StockRow) => <Badge>{r.location_type}</Badge> },
  { key: 'current_stock', header: 'Stock', render: (r: StockRow) => (
    <span className={r.current_stock < 0 ? 'text-red-600 font-medium' : ''}>{r.current_stock}</span>
  )},
]

const expiryColumns = [
  { key: 'product_name', header: 'Product' },
  { key: 'batch_number', header: 'Batch', render: (r: ExpiryAlert) => r.batch_number ?? '—' },
  { key: 'expiry_date', header: 'Expires' },
  { key: 'days_until_expiry', header: 'Days Left', render: (r: ExpiryAlert) => (
    <Badge variant={r.days_until_expiry <= 14 ? 'danger' : r.days_until_expiry <= 30 ? 'warning' : 'default'}>
      {r.days_until_expiry}d
    </Badge>
  )},
]

const lowStockColumns = [
  { key: 'product_name', header: 'Product' },
  { key: 'location_name', header: 'Location' },
  { key: 'current_stock', header: 'Stock' },
  { key: 'avg_daily_sales', header: 'Avg Daily Sales', render: (r: LowStockAlert) => Number(r.avg_daily_sales).toFixed(1) },
  { key: 'days_of_cover', header: 'Days Cover', render: (r: LowStockAlert) => (
    <Badge variant={r.days_of_cover !== null && r.days_of_cover <= 7 ? 'danger' : 'warning'}>
      {r.days_of_cover ?? '—'}d
    </Badge>
  )},
]

export default function StockPage() {
  const [tab, setTab] = useState<Tab>('current')

  const { data: currentData, isLoading: l1 } = useQuery({ queryKey: ['stock'], queryFn: () => stockApi.current().then(r => r.data.data), enabled: tab === 'current' })
  const { data: expiryData, isLoading: l2 } = useQuery({ queryKey: ['stock-expiry'], queryFn: () => stockApi.expiryAlerts().then(r => r.data.data), enabled: tab === 'expiry' })
  const { data: lowData, isLoading: l3 } = useQuery({ queryKey: ['stock-low'], queryFn: () => stockApi.lowStockAlerts().then(r => r.data.data), enabled: tab === 'low' })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Stock & Inventory</h1>

      <div className="flex gap-1 border-b border-gray-200">
        {([['current', 'Current Stock', Package], ['expiry', 'Expiry Alerts', Clock], ['low', 'Low Stock', AlertTriangle]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'current' && <DataTable columns={currentColumns} data={(currentData ?? []) as StockRow[]} isLoading={l1} emptyMessage="No stock data." />}
      {tab === 'expiry' && <DataTable columns={expiryColumns} data={(expiryData ?? []) as ExpiryAlert[]} isLoading={l2} emptyMessage="No expiry alerts." />}
      {tab === 'low' && <DataTable columns={lowStockColumns} data={(lowData ?? []) as LowStockAlert[]} isLoading={l3} emptyMessage="No low stock alerts." />}
    </div>
  )
}
