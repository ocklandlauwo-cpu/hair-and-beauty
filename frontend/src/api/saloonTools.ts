import api from '@/lib/axios'
import type { PaginatedResponse } from '@/types'

export interface SaloonTool {
  id: number
  purchase_date: string
  location_name: string
  name: string
  quantity: number
  unit_cost: string
  total: number
}

export const saloonToolsApi = {
  list: (params?: { location_id?: number | ''; page?: number }) =>
    api.get<PaginatedResponse<SaloonTool>>('/saloon-tools', { params }),
  create: (data: { location_id: number; name: string; quantity: number; unit_cost: number; purchase_date: string }) =>
    api.post<{ data: SaloonTool }>('/saloon-tools', data),
}
