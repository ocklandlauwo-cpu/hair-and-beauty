import api from '@/lib/axios'

export interface ShopBreakdown {
  location_id: number
  location_name: string
  total: string
}

export interface AdminDashboard {
  role: 'admin'
  sales: {
    today: string
    today_by_shop: ShopBreakdown[]
    this_month: string
    this_month_by_shop: ShopBreakdown[]
  }
  expenses: {
    this_month: string
    this_month_by_shop: ShopBreakdown[]
  }
  profit: {
    today: string
    today_by_shop: ShopBreakdown[]
    this_month: string
    this_month_by_shop: ShopBreakdown[]
  }
  asset_value: {
    total: string
    by_shop: ShopBreakdown[]
  }
  store_asset_value: {
    total: string
    by_location: ShopBreakdown[]
  }
  saloon: {
    sales: {
      today: string
      today_by_shop: ShopBreakdown[]
      this_month: string
      this_month_by_shop: ShopBreakdown[]
    }
    profit: {
      today: string
      today_by_shop: ShopBreakdown[]
      this_month: string
      this_month_by_shop: ShopBreakdown[]
    }
    expenses: {
      this_month: string
      this_month_by_shop: ShopBreakdown[]
    }
    asset_value: {
      total: string
      by_shop: ShopBreakdown[]
    }
  }
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
