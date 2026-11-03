import api from '@/lib/axios'

export interface BankDepositInfo {
  id: number
  amount: string
  slip_reference: string | null
  verified_at: string
  verified_by_name: string | null
}

export type DepositChannel = 'cash' | 'nmb' | 'mobile'

export interface DailySalesRow {
  sale_date: string
  location_id: number
  location_name: string
  sales_count: number
  cash: string
  nmb: string
  mobile: string
  total: string
  deposits: Record<DepositChannel, BankDepositInfo | null>
}

export interface BankWithdrawal {
  id: number
  amount: string
  withdrawal_date: string
  reason: string
}

export interface BankSummary {
  money_in: string
  money_out: string
  current_amount: string
  recent_withdrawals: BankWithdrawal[]
}

export const bankApi = {
  salesReport: (params: { from: string; to: string; location_id?: number | '' }) =>
    api.get<{ data: DailySalesRow[] }>('/reports/sales', { params }),
  verifyDeposit: (data: { location_id: number; deposit_date: string; channel: DepositChannel; slip_reference?: string }) =>
    api.post<{ data: { id: number; amount: string } }>('/bank-deposits', data),
  unverifyDeposit: (id: number) =>
    api.delete(`/bank-deposits/${id}`),
  summary: () =>
    api.get<{ data: BankSummary }>('/bank/summary'),
  recordWithdrawal: (data: { amount: number; withdrawal_date: string; reason: string }) =>
    api.post<{ data: BankWithdrawal }>('/bank-withdrawals', data),
}
