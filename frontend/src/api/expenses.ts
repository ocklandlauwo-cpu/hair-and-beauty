import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export const EXPENSE_CATEGORIES = [
  'salary', 'security', 'electricity', 'cleanliness', 'rent', 'transport',
] as const

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

export interface Expense {
  id: number
  location_id: number
  category: ExpenseCategory
  amount: string
  expense_date: string
  recorded_by: number
  notes: string | null
}

export interface PnlData {
  location_id: number | null
  period: { from: string; to: string }
  revenue: string
  cost_of_goods_sold: string
  gross_profit: string
  expenses: string
  net_profit: string
  expense_breakdown: Array<{ category: string; total: string }>
}

export const expensesApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<Expense>>('/expenses', { params: { page } }),
  create: (data: { category: ExpenseCategory; amount: number; expense_date: string; notes?: string; location_id?: number }) =>
    api.post<ApiResponse<Expense>>('/expenses', data),
}

export const pnlApi = {
  get: (params: { from: string; to: string; location_id?: number }) =>
    api.get<{ data: PnlData }>('/reports/pnl', { params }),
}
