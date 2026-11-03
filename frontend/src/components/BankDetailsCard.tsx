import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Landmark, Minus } from 'lucide-react'
import { bankApi } from '@/api/bank'

function fmtTzs(value: string | number) {
  return `TZS ${Number(value).toLocaleString('en-US')}`
}

const todayStr = new Date().toISOString().split('T')[0]

export default function BankDetailsCard() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['bank-summary'],
    queryFn: () => bankApi.summary().then(r => r.data.data),
  })

  const closeForm = () => { setShowForm(false); setAmount(''); setDate(todayStr); setReason(''); setError(null) }

  const mutation = useMutation({
    mutationFn: () => bankApi.recordWithdrawal({ amount: Number(amount), withdrawal_date: date, reason: reason.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-summary'] }); closeForm() },
    onError: err => setError(isAxiosError(err) && err.response?.data?.message ? err.response.data.message : 'Failed to record withdrawal.'),
  })

  const canSubmit = Number(amount) > 0 && !!date && reason.trim().length > 0

  return (
    <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <Landmark size={14} /> Bank Details
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 rounded-md border border-gray-200 px-3 h-8 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <Minus size={12} /> Record withdrawal
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-gray-500">Current Amount</p>
          <p className={`mt-1 text-2xl font-extrabold ${Number(data?.current_amount ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {fmtTzs(data?.current_amount ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Money In</p>
          <p className="mt-1 text-lg font-bold text-green-700">{fmtTzs(data?.money_in ?? 0)}</p>
          <p className="text-xs text-gray-400">verified cash deposits</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Money Out</p>
          <p className="mt-1 text-lg font-bold text-red-600">{fmtTzs(data?.money_out ?? 0)}</p>
          <p className="text-xs text-gray-400">recorded withdrawals</p>
        </div>
      </div>

      {!!data?.recent_withdrawals.length && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-medium text-gray-500">Recent withdrawals</p>
          <ul className="space-y-1">
            {data.recent_withdrawals.map(w => (
              <li key={w.id} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-gray-700">
                  <span className="text-gray-400">{w.withdrawal_date}</span> · {w.reason}
                </span>
                <span className="shrink-0 font-medium text-red-600">−{fmtTzs(w.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Record bank withdrawal">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Record Bank Withdrawal</h2>
            <div>
              <label htmlFor="bw-amount" className="block text-xs font-medium text-gray-500 mb-1">Amount (TZS)</label>
              <input id="bw-amount" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            </div>
            <div>
              <label htmlFor="bw-date" className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <input id="bw-date" type="date" max={todayStr} value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            </div>
            <div>
              <label htmlFor="bw-reason" className="block text-xs font-medium text-gray-500 mb-1">Reason</label>
              <input id="bw-reason" type="text" maxLength={255} value={reason} onChange={e => setReason(e.target.value)}
                className="w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            </div>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex gap-3">
              <button onClick={closeForm} className="flex-1 rounded-md border border-gray-200 h-10 text-sm hover:bg-gray-50">Cancel</button>
              <button
                disabled={!canSubmit || mutation.isPending}
                onClick={() => mutation.mutate()}
                className="flex-1 rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {mutation.isPending ? 'Saving…' : 'Save Withdrawal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
