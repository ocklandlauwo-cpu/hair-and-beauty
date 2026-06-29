import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface Purchase {
  id: number
  purchased_by: number
  supplier_name: string | null
  invoice_number: string | null
  purchase_date: string
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

export const purchasesApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<Purchase>>('/purchases', { params: { page } }),
  create: (data: CreatePurchasePayload) =>
    api.post<ApiResponse<Purchase>>('/purchases', data),
}
