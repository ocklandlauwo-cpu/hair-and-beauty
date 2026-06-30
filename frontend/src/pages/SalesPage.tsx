import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { salesApi, type Sale } from '@/api/sales'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

export default function SalesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [revertId, setRevertId] = useState<number | null>(null)
  const [revertReason, setRevertReason] = useState('')
  const [revertError, setRevertError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: () => salesApi.list().then(r => r.data),
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

  const columns = [
    { key: 'id', header: '#', render: (s: Sale) => `#${s.id}` },
    { key: 'sale_date', header: 'Date', render: (s: Sale) => new Date(s.sale_date).toLocaleDateString() },
    { key: 'payment_method', header: 'Payment', render: (s: Sale) => <Badge className="uppercase">{s.payment_method}</Badge> },
    { key: 'total_amount', header: 'Total (TZS)', render: (s: Sale) => Number(s.total_amount).toLocaleString('en-US') },
    { key: 'is_reverted', header: 'Status', render: (s: Sale) => s.is_reverted ? <Badge variant="danger">Reverted</Badge> : <Badge variant="success">Completed</Badge> },
    ...(isAdmin ? [{
      key: 'actions',
      header: '',
      render: (s: Sale) => !s.is_reverted ? (
        <button
          onClick={() => setRevertId(s.id)}
          className="text-xs text-red-600 hover:underline"
          aria-label={`Revert sale #${s.id}`}
        >
          Revert
        </button>
      ) : null,
    }] : []),
  ]

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

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="No sales yet."
      />

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
