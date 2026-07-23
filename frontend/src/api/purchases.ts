import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface PurchaseItem {
  id: number
  product_id: number
  product_name: string
  quantity: number
  unit_cost: string
  line_total: number
}

export interface Purchase {
  id: number
  purchased_by: number
  supplier_name: string | null
  invoice_number: string | null
  purchase_date: string
  total_amount: number
}

export interface PurchaseDetail extends Purchase {
  items: PurchaseItem[]
}

export interface CreatePurchasePayload {
  purchase_date: string
  supplier_name?: string
  invoice_number?: string
  notes?: string
  items: Array<{
    product_id: number
    quantity: number
    unit_cost: number
    expiry_date?: string
    batch_number?: string
  }>
}

export interface ForecastRow {
  product_id: number
  product_name: string
  category_name: string | null
  latest_cost: string
  avg_daily_sales: string
  current_stock: number
  projected_need: number
  suggested_purchase_qty: number
}

export const purchasesApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<Purchase>>('/purchases', { params: { page } }),
  show: (id: number) =>
    api.get<ApiResponse<PurchaseDetail>>(`/purchases/${id}`),
  create: (data: CreatePurchasePayload) =>
    api.post<ApiResponse<Purchase>>('/purchases', data),
  forecast: (locationId: number, months: number) =>
    api.get<{ data: ForecastRow[] }>('/purchases/forecast', { params: { location_id: locationId, months } }),
}
