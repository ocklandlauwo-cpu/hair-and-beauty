import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface Client {
  id: number
  location_id: number
  name: string
  phone: string | null
  is_active: boolean
}

export const clientsApi = {
  list: () => api.get<PaginatedResponse<Client>>('/clients'),
  create: (data: { name: string; phone?: string }) =>
    api.post<ApiResponse<Client>>('/clients', data),
}
