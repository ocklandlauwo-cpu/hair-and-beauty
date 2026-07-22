import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus, Search, History, ArrowLeftRight } from 'lucide-react'
import { distributionsApi, type Distribution, type DistributionDetail, type SuggestedMovement } from '@/api/distributions'
import { useAuth } from '@/contexts/AuthContext'
import Badge from '@/components/ui/Badge'

const statusVariant = {
  pending: 'warning',
  confirmed: 'success',
  discrepancy: 'danger',
  cancelled: 'default',
} as const

function DistributionItems({ id }: { id: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['distribution', id],
    queryFn: () => distributionsApi.show(id).then(r => r.data.data as DistributionDetail),
  })

  if (isLoading) return <p className="px-4 py-3 text-sm text-gray-400">Loading…</p>
  if (!data?.items?.length) return <p className="px-4 py-3 text-sm text-gray-400">No items.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-500 bg-gray-50">
          <th className="px-4 py-2 text-left font-medium">Product</th>
          <th className="px-4 py-2 text-right font-medium">Sent</th>
          <th className="px-4 py-2 text-right font-medium">Received</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {data.items.map(item => {
          const hasDiscrepancy = item.quantity_received !== null && item.quantity_received !== item.quantity_sent
          return (
            <tr key={item.id}>
              <td className="px-4 py-2 text-gray-800">{item.product_name}</td>
              <td className="px-4 py-2 text-right text-gray-600">{item.quantity_sent}</td>
              <td className={`px-4 py-2 text-right font-medium ${hasDiscrepancy ? 'text-red-600' : 'text-gray-700'}`}>
                {item.quantity_received ?? '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Suggested Movement Tab ──────────────────────────────────────────────
function SuggestedMovementTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['suggested-movements'],
    queryFn: () => distributionsApi.suggestedMovements().then(r => r.data.data),
  })

  if (isLoading) return <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-400">No rebalancing suggestions right now — stock levels look balanced across shops.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Product</th>
            <th className="px-4 py-3 text-left font-medium">Category</th>
            <th className="px-4 py-3 text-left font-medium">From Shop</th>
            <th className="px-4 py-3 text-left font-medium">To Shop</th>
            <th className="px-4 py-3 text-right font-medium">Suggested Qty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row: SuggestedMovement) => (
            <tr key={row.product_id}>
              <td className="px-4 py-3 text-gray-800">{row.product_name}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{row.category_name ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600">
                {row.from_location_name}
                <span className="block text-xs text-gray-400">
                  {row.from_days_of_cover === null ? 'no recent sales' : `${row.from_days_of_cover}d cover`}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">
                {row.to_location_name}
                <span className="block text-xs text-gray-400">{row.to_days_of_cover}d cover</span>
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">{row.suggested_qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DistributionsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'history' | 'suggested'>('history')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [shopSearch, setShopSearch] = useState('')
  const [revertId, setRevertId] = useState<number | null>(null)
  const [revertError, setRevertError] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<number | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['distributions'],
    queryFn: () => distributionsApi.list().then(r => r.data),
  })

  const revertMutation = useMutation({
    mutationFn: (id: number) => distributionsApi.revert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['distributions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setRevertId(null)
      setRevertError(null)
    },
    onError: () => setRevertError('Failed to revert distribution. Please try again.'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => distributionsApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['distributions'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setCancelId(null)
      setCancelError(null)
    },
    onError: () => setCancelError('Failed to cancel distribution. Please try again.'),
  })

  const closeRevert = () => { setRevertId(null); setRevertError(null) }
  const closeCancel = () => { setCancelId(null); setCancelError(null) }

  const distributions: Distribution[] = data?.data ?? []
  const isAdminOrKeeper = user?.role === 'admin' || user?.role === 'store_keeper'
  const isSeller = user?.role === 'seller'

  const filtered = useMemo(() => {
    const q = shopSearch.toLowerCase()
    return q ? distributions.filter(d => (d.to_location_name ?? '').toLowerCase().includes(q)) : distributions
  }, [distributions, shopSearch])

  const toggle = (id: number) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Distributions</h1>
        {tab === 'history' && isAdminOrKeeper && (
          <Link
            to="/distributions/new"
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus size={16} /> New Distribution
          </Link>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          ['history',   'History',            History],
          ['suggested', 'Suggested Movement', ArrowLeftRight],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'history' && (
      <>
      {/* Shop search */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search shop…"
          value={shopSearch}
          onChange={e => setShopSearch(e.target.value)}
          className="w-full h-9 pl-8 pr-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No distributions found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="w-8" />
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Shop</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Confirmed</th>
                <th className="px-4 py-3 text-left font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <>
                  <tr
                    key={d.id}
                    onClick={() => toggle(d.id)}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="pl-3 text-gray-400">
                      {expandedId === d.id
                        ? <ChevronDown size={14} />
                        : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3 text-gray-500">#{d.id}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{d.to_location_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(d.distributed_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[d.status]}>{d.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {d.confirmed_at ? new Date(d.confirmed_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 flex items-center gap-3" onClick={e => e.stopPropagation()}>
                      {isSeller && d.status === 'pending' && (
                        <Link
                          to={`/distributions/${d.id}/confirm`}
                          className="text-primary-600 hover:underline text-xs font-medium"
                        >
                          Verify
                        </Link>
                      )}
                      {isAdminOrKeeper && d.status === 'pending' && (
                        <button
                          onClick={() => setCancelId(d.id)}
                          className="text-xs text-red-600 hover:underline"
                          aria-label={`Cancel distribution #${d.id}`}
                        >
                          Cancel
                        </button>
                      )}
                      {isAdminOrKeeper && (d.status === 'confirmed' || d.status === 'discrepancy') && (
                        <button
                          onClick={() => setRevertId(d.id)}
                          className="text-xs text-amber-600 hover:underline"
                          aria-label={`Revert distribution #${d.id}`}
                        >
                          Rectify
                        </button>
                      )}
                    </td>
                  </tr>

                  {expandedId === d.id && (
                    <tr key={`${d.id}-items`} className="bg-gray-50/60">
                      <td colSpan={7} className="border-t border-gray-100">
                        <DistributionItems id={d.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {tab === 'suggested' && <SuggestedMovementTab />}

      {/* Cancel confirmation modal */}
      {cancelId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-label="Cancel distribution confirmation"
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Cancel Distribution #{cancelId}</h2>
            <p className="text-xs text-gray-500">
              This will cancel the distribution and restore the stock back to the store. This cannot be undone.
            </p>
            {cancelError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{cancelError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={closeCancel}
                className="flex-1 rounded-md border border-gray-200 h-10 text-sm hover:bg-gray-50"
              >
                Keep
              </button>
              <button
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(cancelId!)}
                className="flex-1 rounded-md bg-red-600 h-10 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert / Rectify confirmation modal */}
      {revertId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-label="Rectify distribution confirmation"
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Rectify Distribution #{revertId}</h2>
            <p className="text-xs text-gray-500">
              This will revert the distribution back to <strong>pending</strong> and reverse the stock recorded at the shop. The seller will be able to re-verify with the correct quantities.
            </p>
            {revertError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{revertError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={closeRevert}
                className="flex-1 rounded-md border border-gray-200 h-10 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={revertMutation.isPending}
                onClick={() => revertMutation.mutate(revertId!)}
                className="flex-1 rounded-md bg-amber-600 h-10 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {revertMutation.isPending ? 'Reverting…' : 'Confirm Rectify'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
