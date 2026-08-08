import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface Sale {
  id: number
  location_id: number
  location_name: string
  sold_by: number
  client_id: number | null
  client_name: string | null
  payment_method: 'nmb' | 'airtel' | 'vodacom' | 'tigo' | 'cash'
  total_amount: string
  discount_amount: string
  is_reverted: boolean
  sale_date: string
}

export interface SaleItem {
  product_id: number
  quantity: number
  unit_price?: number
  batch_id?: number
}

export interface SaleDetailItem {
  id: number
  product_id: number
  product_name: string
  batch_id: number | null
  quantity: number
  unit_price: string
  price_tier: string
}

export interface SaleDetail extends Sale {
  items: SaleDetailItem[]
}

export interface SalesAnalysisRow {
  product_id: number
  product_name: string
  quantity_sold: number
  shop: string
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
  list: (params?: { page?: number; location_id?: number | ''; date_from?: string; date_to?: string }) =>
    api.get<PaginatedResponse<Sale>>('/sales', { params }),
  show: (id: number) =>
    api.get<{ data: SaleDetail }>(`/sales/${id}`),
  create: (data: CreateSalePayload) =>
    api.post<ApiResponse<Sale>>('/sales', data),
  revert: (id: number, reason: string) =>
    api.post<ApiResponse<Sale>>(`/sales/${id}/revert`, { reason }),
  analysis: (params?: { location_id?: number | ''; date_from?: string; date_to?: string; search?: string; page?: number }) =>
    api.get<PaginatedResponse<SalesAnalysisRow>>('/sales/analysis', { params }),
}
