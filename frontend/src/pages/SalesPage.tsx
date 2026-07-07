import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { salesApi, type Sale, type SaleDetail } from '@/api/sales'
import { locationsApi } from '@/api/locations'
import { useAuth } from '@/contexts/AuthContext'
import Badge from '@/components/ui/Badge'

const today = new Date()
const defaultDateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
const defaultDateTo   = today.toISOString().split('T')[0]

function SaleItems({ id }: { id: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: () => salesApi.show(id).then(r => r.data.data as SaleDetail),
  })

  if (isLoading) return <p className="px-4 py-3 text-sm text-gray-400">Loading…</p>
  if (!data?.items?.length) return <p className="px-4 py-3 text-sm text-gray-400">No items.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-500 bg-gray-50">
          <th className="px-4 py-2 text-left font-medium">Product</th>
          <th className="px-4 py-2 text-center font-medium">Qty</th>
          <th className="px-4 py-2 text-right font-medium">Unit Price (TZS)</th>
          <th className="px-4 py-2 text-right font-medium">Line Total (TZS)</th>
          <th className="px-4 py-2 text-left font-medium">Tier</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {data.items.map(item => (
          <tr key={item.id}>
            <td className="px-4 py-2 text-gray-800">{item.product_name}</td>
            <td className="px-4 py-2 text-center text-gray-600">{item.quantity}</td>
            <td className="px-4 py-2 text-right text-gray-600">
              {Number(item.unit_price).toLocaleString('en-US')}
            </td>
            <td className="px-4 py-2 text-right font-medium text-gray-800">
              {(Number(item.unit_price) * item.quantity).toLocaleString('en-US')}
            </td>
            <td className="px-4 py-2">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 capitalize">
                {item.price_tier}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function SalesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [revertId, setRevertId] = useState<number | null>(null)
  const [revertReason, setRevertReason] = useState('')
  const [revertError, setRevertError] = useState<string | null>(null)
  const [locationId, setLocationId] = useState<number | ''>('')
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['sales', locationId, dateFrom, dateTo],
    queryFn: () => salesApi.list({ location_id: locationId || undefined, date_from: dateFrom, date_to: dateTo }).then(r => r.data),
  })

  const revertMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      salesApi.revert(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setRevertId(null)
      setRevertReason('')
      setRevertError(null)
    },
    onError: () => setRevertError('Failed to revert sale. Try again.'),
  })

  const closeModal = () => {
    setRevertId(null)
    setRevertReason('')
    setRevertError(null)
  }

  const isAdmin = user?.role === 'admin'
  const sales: Sale[] = data?.data ?? []

  const toggle = (id: number) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Sales</h1>
        {(user?.role === 'seller' || user?.role === 'admin') && (
          <Link
            to="/sales/new"
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus size={16} /> New Sale
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="filter-shop" className="block text-xs font-medium text-gray-500 mb-1">Shop</label>
          <select
            id="filter-shop"
            value={locationId}
            onChange={e => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="">All shops</option>
            {(locationsData ?? []).map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-from" className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            id="filter-from"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="filter-to" className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            id="filter-to"
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : sales.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No sales for this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="w-8" />
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Shop</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Payment</th>
                <th className="px-4 py-3 text-right font-medium">Total (TZS)</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <>
                  <tr
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="pl-3 text-gray-400">
                      {expandedId === s.id
                        ? <ChevronDown size={14} />
                        : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3 text-gray-500">#{s.id}</td>
                    <td className="px-4 py-3 text-gray-600">{s.location_name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(s.sale_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="uppercase">{s.payment_method}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      {Number(s.total_amount).toLocaleString('en-US')}
                    </td>
                    <td className="px-4 py-3">
                      {s.is_reverted
                        ? <Badge variant="danger">Reverted</Badge>
                        : <Badge variant="success">Completed</Badge>}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {!s.is_reverted && (
                          <button
                            onClick={() => setRevertId(s.id)}
                            className="text-xs text-red-600 hover:underline"
                            aria-label={`Revert sale #${s.id}`}
                          >
                            Revert
                          </button>
                        )}
                      </td>
                    )}
                  </tr>

                  {expandedId === s.id && (
                    <tr key={`${s.id}-items`} className="bg-gray-50/60">
                      <td colSpan={isAdmin ? 8 : 7} className="border-t border-gray-100">
                        <SaleItems id={s.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revert confirmation modal */}
      {revertId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-label="Revert sale confirmation"
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Revert Sale #{revertId}</h2>
            <p className="text-xs text-gray-500">
              This will mark the sale as reverted. Stock is not automatically restored. Provide a reason.
            </p>
            <div>
              <label htmlFor="revert-reason" className="block text-sm font-medium text-gray-700">
                Reason
              </label>
              <textarea
                id="revert-reason"
                rows={3}
                value={revertReason}
                onChange={e => setRevertReason(e.target.value)}
                placeholder="Enter reason for reverting…"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
            {revertError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{revertError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 rounded-md border border-gray-200 h-10 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={!revertReason.trim() || revertMutation.isPending}
                onClick={() => revertMutation.mutate({ id: revertId!, reason: revertReason.trim() })}
                className="flex-1 rounded-md bg-red-600 h-10 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {revertMutation.isPending ? 'Reverting…' : 'Confirm Revert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
