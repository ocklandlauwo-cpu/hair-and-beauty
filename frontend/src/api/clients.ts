import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface Client {
  id: number
  location_id: number
  location_name: string | null
  name: string
  phone: string | null
  notes: string | null
  is_active: boolean
  last_purchase_date: string | null
  days_since_purchase: number | null
  last_products: string | null
}

export const clientsApi = {
  list: (page = 1, location_id?: number, search?: string, follow_up?: boolean, days_inactive?: number, category_id?: number) =>
    api.get<PaginatedResponse<Client>>('/clients', { params: {
      page,
      ...(location_id   ? { location_id }            : {}),
      ...(search        ? { search }                  : {}),
      ...(follow_up     ? { follow_up: 1 }            : {}),
      ...(days_inactive ? { days_inactive }            : {}),
      ...(category_id   ? { category_id }             : {}),
    }}),
  create: (data: { name: string; phone?: string | null; notes?: string | null; location_id?: number }) =>
    api.post<ApiResponse<Client>>('/clients', data),
  update: (id: number, data: Partial<{ name: string; phone: string | null; notes: string | null; is_active: boolean }>) =>
    api.put<ApiResponse<Client>>(`/clients/${id}`, data),
  delete: (id: number) =>
    api.delete(`/clients/${id}`),
}
