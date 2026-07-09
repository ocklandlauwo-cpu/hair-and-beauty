import api from '@/lib/axios'

export interface TopClient {
  client_id: number
  client_name: string
  phone: string | null
  location_name: string | null
  total_purchases: number
  total_spend: string
  avg_order_value: string
  last_purchase_date: string
}

export type TopClientsPeriod = 'all' | 'month' | 'year' | '30d' | '90d'

export const aiReportsApi = {
  topClients: (period: TopClientsPeriod = 'all') =>
    api.get<{ data: TopClient[] }>('/ai-reports/top-clients', { params: { period } }),
}
