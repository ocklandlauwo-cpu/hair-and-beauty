import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface Sale {
  id: number
  location_id: number
  sold_by: number
  client_id: number | null
  payment_method: 'nmb' | 'airtel' | 'vodacom' | 'tigo' | 'cash'
  total_amount: string
  discount_amount: string
  is_reverted: boolean
  sale_date: string
}

export interface SaleItem {
  product_id: number
  quantity: number
  batch_id?: number
}

export interface CreateSalePayload {
  payment_method: 'nmb' | 'airtel' | 'vodacom' | 'tigo' | 'cash'
  sale_date: string
  location_id?: number
  client_id?: number
  discount_amount?: number
  items: SaleItem[]
}

export const salesApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<Sale>>('/sales', { params: { page } }),
  create: (data: CreateSalePayload) =>
    api.post<ApiResponse<Sale>>('/sales', data),
  revert: (id: number, reason: string) =>
    api.post<ApiResponse<Sale>>(`/sales/${id}/revert`, { reason }),
}
