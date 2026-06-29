import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface Product {
  id: number
  category_id: number
  category_name?: string
  name: string
  sku: string | null
  unit: string
  wholesale_threshold: number
  wholesale_price: string
  retail_price: string
  latest_cost: string
  is_active: boolean
}

export const productsApi = {
  list: (params?: { page?: number; search?: string }) =>
    api.get<PaginatedResponse<Product>>('/products', { params }),
  show: (id: number) =>
    api.get<ApiResponse<Product>>(`/products/${id}`),
}
