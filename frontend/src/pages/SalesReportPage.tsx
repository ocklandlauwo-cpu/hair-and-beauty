import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { CheckCircle2 } from 'lucide-react'
import { bankApi, type DailySalesRow, type DepositChannel } from '@/api/bank'
import { locationsApi } from '@/api/locations'

const now = new Date()
const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
const defaultTo = now.toISOString().split('T')[0]

const CHANNELS: Array<{ key: DepositChannel; label: string }> = [
  { key: 'cash',   label: 'Cash' },
  { key: 'nmb',    label: 'NMB' },
  { key: 'mobile', label: 'Mobile Money' },
  { key: 'saloon', label: 'Saloon Center' },
]
const channelLabel = (key: DepositChannel) => CHANNELS.find(c => c.key === key)!.label

function fmtTzs(value: string | number) {
  return `TZS ${Number(value).toLocaleString('en-US')}`
}

function errorMessage(err: unknown, fallback: string) {
  return isAxiosError(err) && err.response?.data?.message ? err.response.data.message : fallback
}

interface Target { row: DailySalesRow; channel: DepositChannel }

export default function SalesReportPage() {
  const qc = useQueryClient()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [locationId, setLocationId] = useState<number | ''>('')
  const [verifyTarget, setVerifyTarget] = useState<Target | null>(null)
  const [slipRef, setSlipRef] = useState('')
  const [unverifyTarget, setUnverifyTarget] = useState<Target | null>(null)
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
    saloon: acc.saloon + Number(r.saloon),
    total: acc.total + Number(r.total),
    verified: acc.verified + CHANNELS.reduce((s, c) => s + Number(r.deposits[c.key]?.amount ?? 0), 0),
  }), { cash: 0, nmb: 0, mobile: 0, saloon: 0, total: 0, verified: 0 }), [rows])

  const onBankChanged = () => {
    qc.invalidateQueries({ queryKey: ['sales-report'] })
    qc.invalidateQueries({ queryKey: ['bank-summary'] })
  }

  const closeModals = () => { setVerifyTarget(null); setUnverifyTarget(null); setSlipRef(''); setModalError(null) }

  const verifyMutation = useMutation({
    mutationFn: ({ row, channel }: Target) => bankApi.verifyDeposit({
      location_id: row.location_id,
      deposit_date: row.sale_date,
      channel,
      slip_reference: slipRef.trim() || undefined,
    }),
    onSuccess: () => { onBankChanged(); closeModals() },
    onError: err => setModalError(errorMessage(err, 'Failed to verify. Please try again.')),
  })

  const unverifyMutation = useMutation({
    mutationFn: (id: number) => bankApi.unverifyDeposit(id),
    onSuccess: () => { onBankChanged(); closeModals() },
    onError: err => setModalError(errorMessage(err, 'Failed to unverify. Please try again.')),
  })

  const unverifyDeposit = unverifyTarget ? unverifyTarget.row.deposits[unverifyTarget.channel] : null

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
                {CHANNELS.map(c => (
                  <th key={c.key} className="px-4 py-3 text-right font-medium">{c.label}</th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={`${r.sale_date}-${r.location_id}`} className="align-top hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.sale_date}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.location_name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {r.sales_count}
                    {r.saloon_count > 0 && <p className="text-xs text-gray-400">+{r.saloon_count} saloon</p>}
                  </td>
                  {CHANNELS.map(c => {
                    const amount = Number(r[c.key])
                    const deposit = r.deposits[c.key]
                    return (
                      <td key={c.key} className="px-4 py-3 text-right whitespace-nowrap">
                        <p className="text-gray-800">{fmtTzs(amount)}</p>
                        {deposit ? (
                          <div className="mt-1 flex items-center justify-end gap-1">
                            <CheckCircle2 size={13} className="shrink-0 text-green-600" />
                            <span
                              className="text-xs font-medium text-green-700"
                              title={`${deposit.verified_by_name ?? '—'}, ${new Date(deposit.verified_at).toLocaleString()}${deposit.slip_reference ? ` · Slip ${deposit.slip_reference}` : ''}`}
                            >
                              Verified{deposit.slip_reference && ` · ${deposit.slip_reference}`}
                            </span>
                            <button
                              onClick={() => setUnverifyTarget({ row: r, channel: c.key })}
                              className="ml-1 text-xs text-gray-400 underline hover:text-red-600"
                            >
                              Undo
                            </button>
                          </div>
                        ) : amount > 0 ? (
                          <button
                            onClick={() => setVerifyTarget({ row: r, channel: c.key })}
                            className="mt-1 rounded-md bg-primary-600 px-2.5 h-7 text-xs font-medium text-white hover:bg-primary-700"
                          >
                            Verify
                          </button>
                        ) : null}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtTzs(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 text-sm font-semibold text-gray-900">
              <tr>
                <td className="px-4 py-3" colSpan={3}>Total</td>
                {CHANNELS.map(c => (
                  <td key={c.key} className="px-4 py-3 text-right whitespace-nowrap">{fmtTzs(totals[c.key])}</td>
                ))}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {fmtTzs(totals.total)}
                  <p className="text-xs font-medium text-gray-500">Verified {fmtTzs(totals.verified)}</p>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Verify modal */}
      {verifyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Verify bank deposit">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Verify {channelLabel(verifyTarget.channel)} in Bank</h2>
            <p className="text-xs text-gray-500">
              Confirm that <strong>{fmtTzs(verifyTarget.row[verifyTarget.channel])}</strong> {channelLabel(verifyTarget.channel)} from{' '}
              <strong>{verifyTarget.row.location_name}</strong> for <strong>{verifyTarget.row.sale_date}</strong> has reached the bank.
              It will be added to Money In.
            </p>
            <div>
              <label htmlFor="slip-ref" className="block text-xs font-medium text-gray-500 mb-1">Bank slip / transaction reference (optional)</label>
              <input id="slip-ref" type="text" maxLength={100} value={slipRef} onChange={e => setSlipRef(e.target.value)}
                className="w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            </div>
            {modalError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>}
            <div className="flex gap-3">
              <button onClick={closeModals} className="flex-1 rounded-md border border-gray-200 h-10 text-sm hover:bg-gray-50">Cancel</button>
              <button
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate(verifyTarget)}
                className="flex-1 rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {verifyMutation.isPending ? 'Verifying…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unverify modal */}
      {unverifyTarget && unverifyDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Unverify bank deposit">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Undo Verification</h2>
            <p className="text-xs text-gray-500">
              This removes the verified {channelLabel(unverifyTarget.channel)} amount of <strong>{fmtTzs(unverifyDeposit.amount)}</strong> for{' '}
              <strong>{unverifyTarget.row.location_name}</strong> on {unverifyTarget.row.sale_date} and takes it out of Money In.
            </p>
            {modalError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>}
            <div className="flex gap-3">
              <button onClick={closeModals} className="flex-1 rounded-md border border-gray-200 h-10 text-sm hover:bg-gray-50">Keep</button>
              <button
                disabled={unverifyMutation.isPending}
                onClick={() => unverifyMutation.mutate(unverifyDeposit.id)}
                className="flex-1 rounded-md bg-red-600 h-10 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {unverifyMutation.isPending ? 'Removing…' : 'Yes, Undo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
