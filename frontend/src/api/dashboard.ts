import api from '@/lib/axios'

export interface AdminDashboard {
  role: 'admin'
  sales: { today: string; this_month: string }
  expenses: { this_month: string }
  distributions: { pending: number }
  stock: { expiry_alerts: number; low_stock_alerts: number }
  users: { active: number }
}

export interface StoreKeeperDashboard {
  role: 'store_keeper'
  distributions: { pending: number; this_week: number }
  purchases: { this_month_count: number }
  stock: { expiry_alerts: number; low_stock_alerts: number }
}

export interface SellerDashboard {
  role: 'seller'
  sales_today: string
  sales_count_today: number
  reconciliation_pending: boolean
  low_stock_count: number
  attendance_today: 'clock_in' | 'clock_out' | null
}

export type DashboardData = AdminDashboard | StoreKeeperDashboard | SellerDashboard

export const dashboardApi = {
  get: () => api.get<{ data: DashboardData }>('/dashboard'),
}
