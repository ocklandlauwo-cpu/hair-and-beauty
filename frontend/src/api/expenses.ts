import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export const EXPENSE_CATEGORIES = [
  'salary', 'security', 'electricity', 'cleanliness', 'rent', 'transport',
] as const

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

export const BUSINESS_LINES = ['shop', 'saloon'] as const
export type BusinessLine = typeof BUSINESS_LINES[number]

export interface Expense {
  id: number
  location_id: number
  location_name: string | null
  category: ExpenseCategory
  amount: string
  expense_date: string
  recorded_by: number
  notes: string | null
  business_line: BusinessLine
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
  create: (data: { category: ExpenseCategory; amount: number; expense_date: string; notes?: string; location_id?: number; business_line?: BusinessLine }) =>
    api.post<ApiResponse<Expense>>('/expenses', data),
}

export const pnlApi = {
  get: (params: { from: string; to: string; location_id?: number }) =>
    api.get<{ data: PnlData }>('/reports/pnl', { params }),
}
