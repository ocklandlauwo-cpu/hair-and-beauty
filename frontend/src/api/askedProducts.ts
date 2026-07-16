import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface AskedProduct {
  id: number
  location_id: number
  location_name: string | null
  product_name: string
  times_asked: number
  created_at: string
  updated_at: string
}

export const askedProductsApi = {
  list: (page = 1, location_id?: number) =>
    api.get<PaginatedResponse<AskedProduct>>('/asked-products', { params: {
      page,
      ...(location_id ? { location_id } : {}),
    }}),
  create: (data: { product_name: string; location_id?: number }) =>
    api.post<ApiResponse<AskedProduct>>('/asked-products', data),
  increment: (id: number) =>
    api.post<ApiResponse<AskedProduct>>(`/asked-products/${id}/increment`),
  delete: (id: number) =>
    api.delete(`/asked-products/${id}`),
}
