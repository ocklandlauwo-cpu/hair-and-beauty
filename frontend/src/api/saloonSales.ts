import api from '@/lib/axios'
import type { PaginatedResponse } from '@/types'

export interface SaloonSale {
  id: number
  sale_date: string
  provider_name: string
  service_name: string
  amount: string
  location_name: string
}

export const saloonSalesApi = {
  list: (params?: { location_id?: number | ''; date_from?: string; date_to?: string; page?: number }) =>
    api.get<PaginatedResponse<SaloonSale>>('/saloon-sales', { params }),
  create: (data: { location_id?: number; provider_id: number; saloon_service_id: number; amount: number; sale_date: string }) =>
    api.post<{ data: SaloonSale }>('/saloon-sales', data),
}
