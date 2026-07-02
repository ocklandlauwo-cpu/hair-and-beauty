import api from '@/lib/axios'

export interface LocationRow {
  date: string
  location_name: string
  total: string
}

export interface LocationChartData {
  rows: LocationRow[]
  locations: string[]
}

export interface PurchaseMonthRow {
  month: string
  month_label: string
  total: string
  count: number
}

export const chartsApi = {
  salesByLocation: (from: string, to: string) =>
    api.get<{ data: LocationChartData }>('/charts/sales-by-location', { params: { from, to } }),
  profitByLocation: (from: string, to: string) =>
    api.get<{ data: LocationChartData }>('/charts/profit-by-location', { params: { from, to } }),
  purchasesByMonth: (from: string, to: string) =>
    api.get<{ data: PurchaseMonthRow[] }>('/charts/purchases-by-month', { params: { from, to } }),
}
