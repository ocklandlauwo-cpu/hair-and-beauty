import api from '@/lib/axios'

export interface StockRow {
  id: number  // synthetic: product_id (used as DataTable key)
  product_id: number
  product_name: string
  sku: string | null
  location_id: number
  location_name: string
  location_type: string
  current_stock: number
}

export interface ExpiryAlert {
  id: number  // batch_id (used as DataTable key)
  batch_id: number
  product_id: number
  product_name: string
  batch_number: string | null
  expiry_date: string
  days_until_expiry: number
}

export interface LowStockAlert {
  id: number  // product_id (used as DataTable key)
  product_id: number
  product_name: string
  location_id: number
  location_name: string
  current_stock: number
  avg_daily_sales: string
  days_of_cover: number | null
}

export const stockApi = {
  current: () => api.get<{ data: StockRow[] }>('/stock'),
  expiryAlerts: () => api.get<{ data: ExpiryAlert[] }>('/stock/alerts/expiry'),
  lowStockAlerts: () => api.get<{ data: LowStockAlert[] }>('/stock/alerts/low'),
}
