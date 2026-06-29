import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface Reconciliation {
  id: number
  location_id: number
  seller_id: number
  reconciliation_date: string
  total_sold_amount: string
  receipt_path: string | null
  notes: string | null
  verified_by: number | null
  verified_at: string | null
}

export interface CreateReconciliationPayload {
  reconciliation_date: string
  total_sold_amount: number
  notes?: string
}

export const reconciliationsApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<Reconciliation>>('/reconciliations', { params: { page } }),
  create: (data: CreateReconciliationPayload) =>
    api.post<ApiResponse<Reconciliation>>('/reconciliations', data),
}
