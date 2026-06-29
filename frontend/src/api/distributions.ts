import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface Distribution {
  id: number
  from_location_id: number
  to_location_id: number
  distributed_by: number
  confirmed_by: number | null
  status: 'pending' | 'confirmed' | 'discrepancy'
  distributed_at: string
  confirmed_at: string | null
  notes: string | null
  items?: DistributionItem[]
}

export interface DistributionItem {
  id: number
  distribution_id: number
  product_id: number
  quantity_sent: number
  quantity_received: number | null
}

export interface CreateDistributionPayload {
  to_location_id: number
  distributed_at: string
  notes?: string
  items: Array<{ product_id: number; quantity_sent: number }>
}

export interface ConfirmDistributionPayload {
  items: Array<{ distribution_item_id: number; quantity_received: number }>
}

export const distributionsApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<Distribution>>('/distributions', { params: { page } }),
  show: (id: number) =>
    api.get<ApiResponse<Distribution>>(`/distributions/${id}`),
  create: (data: CreateDistributionPayload) =>
    api.post<ApiResponse<Distribution>>('/distributions', data),
  confirm: (id: number, data: ConfirmDistributionPayload) =>
    api.post<ApiResponse<Distribution>>(`/distributions/${id}/confirm`, data),
}
