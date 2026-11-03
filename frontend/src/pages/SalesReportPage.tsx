import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { CheckCircle2, Landmark } from 'lucide-react'
import { bankApi, type DailySalesRow } from '@/api/bank'
import { locationsApi } from '@/api/locations'

const now = new Date()
const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
const defaultTo = now.toISOString().split('T')[0]

function fmtTzs(value: string | number) {
  return `TZS ${Number(value).toLocaleString('en-US')}`
}

function errorMessage(err: unknown, fallback: string) {
  return isAxiosError(err) && err.response?.data?.message ? err.response.data.message : fallback
}

export default function SalesReportPage() {
  const qc = useQueryClient()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [locationId, setLocationId] = useState<number | ''>('')
  const [verifyRow, setVerifyRow] = useState<DailySalesRow | null>(null)
  const [slipRef, setSlipRef] = useState('')
  const [unverifyRow, setUnverifyRow] = useState<DailySalesRow | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })
  const shops = (locations ?? []).filter(l => l.type === 'shop')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['sales-report', from, to, locationId],
    queryFn: () => bankApi.salesReport({ from, to, location_id: locationId }).then(r => r.data.data),
    enabled: !!from && !!to && from <= to,
  })

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    cash: acc.cash + Number(r.cash),
    nmb: acc.nmb + Number(r.nmb),
    mobile: acc.mobile + Number(r.mobile),
    total: acc.total + Number(r.total),
    banked: acc.banked + Number(r.deposit?.amount ?? 0),
  }), { cash: 0, nmb: 0, mobile: 0, total: 0, banked: 0 }), [rows])

  const onBankChanged = () => {
    qc.invalidateQueries({ queryKey: ['sales-report'] })
    qc.invalidateQueries({ queryKey: ['bank-summary'] })
  }

  const closeModals = () => { setVerifyRow(null); setUnverifyRow(null); setSlipRef(''); setModalError(null) }

  const verifyMutation = useMutation({
    mutationFn: (row: DailySalesRow) => bankApi.verifyDeposit({
      location_id: row.location_id,
      deposit_date: row.sale_date,
      slip_reference: slipRef.trim() || undefined,
    }),
    onSuccess: () => { onBankChanged(); closeModals() },
    onError: err => setModalError(errorMessage(err, 'Failed to verify deposit. Please try again.')),
  })

  const unverifyMutation = useMutation({
    mutationFn: (id: number) => bankApi.unverifyDeposit(id),
    onSuccess: () => { onBankChanged(); closeModals() },
    onError: err => setModalError(errorMessage(err, 'Failed to unverify deposit. Please try again.')),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Sales Report</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="sr-from" className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input id="sr-from" type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="sr-to" className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input id="sr-to" type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="sr-shop" className="block text-xs font-medium text-gray-500 mb-1">Shop</label>
          <select id="sr-shop" value={locationId} onChange={e => setLocationId(e.target.value ? Number(e.target.value) : '')}
            className="rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
            <option value="">All shops</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No sales in this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Shop</th>
                <th className="px-4 py-3 text-right font-medium">Sales</th>
                <th className="px-4 py-3 text-right font-medium">Cash</th>
                <th className="px-4 py-3 text-right font-medium">NMB</th>
                <th className="px-4 py-3 text-right font-medium">Mobile Money</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-left font-medium">Bank Deposit (Cash)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={`${r.sale_date}-${r.location_id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.sale_date}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.location_name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.sales_count}</td>
                  <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">{fmtTzs(r.cash)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtTzs(r.nmb)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtTzs(r.mobile)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtTzs(r.total)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.deposit ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="shrink-0 text-green-600" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-green-700">
                            Verified {fmtTzs(r.deposit.amount)}{r.deposit.slip_reference && ` · Slip ${r.deposit.slip_reference}`}
                          </p>
                          <p className="text-xs text-gray-400">
                            {r.deposit.verified_by_name ?? '—'}, {new Date(r.deposit.verified_at).toLocaleString()}
                          </p>
                        </div>
                        <button
                          onClick={() => setUnverifyRow(r)}
                          className="ml-1 text-xs text-gray-400 underline hover:text-red-600"
                        >
                          Unverify
                        </button>
                      </div>
                    ) : Number(r.cash) > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pending</span>
                        <button
                          onClick={() => setVerifyRow(r)}
                          className="flex items-center gap-1 rounded-md bg-primary-600 px-3 h-8 text-xs font-medium text-white hover:bg-primary-700"
                        >
                          <Landmark size={12} /> Verify
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No cash</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 text-sm font-semibold text-gray-900">
              <tr>
                <td className="px-4 py-3" colSpan={3}>Total</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{fmtTzs(totals.cash)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{fmtTzs(totals.nmb)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{fmtTzs(totals.mobile)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{fmtTzs(totals.total)}</td>
                <td className="px-4 py-3 text-xs font-medium text-gray-600 whitespace-nowrap">
                  Banked {fmtTzs(totals.banked)} of {fmtTzs(totals.cash)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Verify deposit modal */}
      {verifyRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Verify bank deposit">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Verify Bank Deposit</h2>
            <p className="text-xs text-gray-500">
              Confirm that <strong>{fmtTzs(verifyRow.cash)}</strong> cash from <strong>{verifyRow.location_name}</strong> for{' '}
              <strong>{verifyRow.sale_date}</strong> has been deposited in the bank. It will be added to Money In.
            </p>
            <div>
              <label htmlFor="slip-ref" className="block text-xs font-medium text-gray-500 mb-1">Bank slip reference (optional)</label>
              <input id="slip-ref" type="text" maxLength={100} value={slipRef} onChange={e => setSlipRef(e.target.value)}
                className="w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            </div>
            {modalError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>}
            <div className="flex gap-3">
              <button onClick={closeModals} className="flex-1 rounded-md border border-gray-200 h-10 text-sm hover:bg-gray-50">Cancel</button>
              <button
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate(verifyRow)}
                className="flex-1 rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {verifyMutation.isPending ? 'Verifying…' : 'Confirm Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unverify deposit modal */}
      {unverifyRow?.deposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Unverify bank deposit">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Unverify Deposit</h2>
            <p className="text-xs text-gray-500">
              This removes the verified deposit of <strong>{fmtTzs(unverifyRow.deposit.amount)}</strong> for{' '}
              <strong>{unverifyRow.location_name}</strong> and takes it out of Money In.
            </p>
            {modalError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>}
            <div className="flex gap-3">
              <button onClick={closeModals} className="flex-1 rounded-md border border-gray-200 h-10 text-sm hover:bg-gray-50">Keep</button>
              <button
                disabled={unverifyMutation.isPending}
                onClick={() => unverifyMutation.mutate(unverifyRow.deposit!.id)}
                className="flex-1 rounded-md bg-red-600 h-10 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {unverifyMutation.isPending ? 'Removing…' : 'Yes, Unverify'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
