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
}

export const clientsApi = {
  list: (page = 1, location_id?: number, search?: string) =>
    api.get<PaginatedResponse<Client>>('/clients', { params: { page, ...(location_id ? { location_id } : {}), ...(search ? { search } : {}) } }),
  create: (data: { name: string; phone?: string | null; notes?: string | null; location_id?: number }) =>
    api.post<ApiResponse<Client>>('/clients', data),
  update: (id: number, data: Partial<{ name: string; phone: string | null; notes: string | null; is_active: boolean }>) =>
    api.put<ApiResponse<Client>>(`/clients/${id}`, data),
  delete: (id: number) =>
    api.delete(`/clients/${id}`),
}
