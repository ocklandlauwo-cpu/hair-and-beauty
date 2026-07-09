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

export interface SlowStockAlert {
  product_id: number
  product_name: string
  category_name: string | null
  retail_price: string
  total_stock: number
  days_since_last_sale: number | null
}

export type MovementType =
  | 'purchase'
  | 'distribution_in'
  | 'distribution_out'
  | 'sale'
  | 'sale_revert'
  | 'adjustment'

export interface StockMovement {
  id: number
  movement_type: MovementType
  quantity: number
  created_at: string
}

export interface AdjustPayload {
  product_id: number
  location_id: number
  new_quantity: number
  notes?: string
}

export const stockApi = {
  current: () => api.get<{ data: StockRow[] }>('/stock'),
  movements: (productId: number, locationId: number) =>
    api.get<{ data: StockMovement[] }>('/stock/movements', {
      params: { product_id: productId, location_id: locationId },
    }),
  expiryAlerts: () => api.get<{ data: ExpiryAlert[] }>('/stock/alerts/expiry'),
  lowStockAlerts: () => api.get<{ data: LowStockAlert[] }>('/stock/alerts/low'),
  slowStockAlerts: () => api.get<{ data: SlowStockAlert[] }>('/stock/alerts/slow'),
  adjust: (payload: AdjustPayload) => api.post<{ message: string; new_quantity: number }>('/stock/adjust', payload),
}
