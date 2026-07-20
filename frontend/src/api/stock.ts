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

export interface StockMovementHistoryMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
  product_name: string | null
  location_name: string | null
}

export interface StockMovementHistoryResponse {
  data: StockMovement[]
  meta: StockMovementHistoryMeta
}

export interface AdjustPayload {
  product_id: number
  location_id: number
  new_quantity: number
  notes?: string
}

// ── Movement label + colour map (shared by the Stock page's inline preview
// and the full-history page) ────────────────────────────────────────────
export const MOVEMENT_META: Record<MovementType, { label: string; increase: boolean | null }> = {
  purchase:         { label: 'Purchase',         increase: true  },
  distribution_in:  { label: 'Distribution In',  increase: true  },
  sale_revert:      { label: 'Sale Revert',       increase: true  },
  distribution_out: { label: 'Distribution Out',  increase: false },
  sale:             { label: 'Sale',              increase: false },
  adjustment:       { label: 'Adjustment',        increase: null  },
}

export const stockApi = {
  current: () => api.get<{ data: StockRow[] }>('/stock'),
  movements: (productId: number, locationId: number) =>
    api.get<{ data: StockMovement[] }>('/stock/movements', {
      params: { product_id: productId, location_id: locationId },
    }),
  movementsHistory: (productId: number, locationId: number, page = 1) =>
    api.get<StockMovementHistoryResponse>('/stock/movements/history', {
      params: { product_id: productId, location_id: locationId, page },
    }),
  expiryAlerts: () => api.get<{ data: ExpiryAlert[] }>('/stock/alerts/expiry'),
  lowStockAlerts: () => api.get<{ data: LowStockAlert[] }>('/stock/alerts/low'),
  slowStockAlerts: () => api.get<{ data: SlowStockAlert[] }>('/stock/alerts/slow'),
  adjust: (payload: AdjustPayload) => api.post<{ message: string; new_quantity: number }>('/stock/adjust', payload),
}
