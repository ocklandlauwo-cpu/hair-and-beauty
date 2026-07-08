import { useState, type SyntheticEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { distributionsApi } from '@/api/distributions'

export default function ConfirmDistributionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: dist, isLoading } = useQuery({
    queryKey: ['distribution', Number(id)],
    queryFn: () => distributionsApi.show(Number(id)).then(r => r.data.data),
  })

  const [received, setReceived] = useState<Record<number, number>>({})
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof distributionsApi.confirm>[1]) =>
      distributionsApi.confirm(Number(id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['distributions'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/distributions')
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : 'Failed to submit verification. Please try again.'),
  })

  if (isLoading || !dist) return <div className="p-6 text-sm text-gray-400">Loading…</div>

  if (dist.status !== 'pending') {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold text-gray-900">Distribution #{id}</h1>
        <p className="text-sm text-gray-500">This distribution has already been verified (status: {dist.status}).</p>
        <button onClick={() => navigate('/distributions')} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">
          Back
        </button>
      </div>
    )
  }

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault()
    const items = (dist.items ?? []).map(item => ({
      distribution_item_id: item.id,
      quantity_received: received[item.id] ?? item.quantity_sent,
    }))
    mutation.mutate({ items })
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Verify Distribution #{id}</h1>
        <p className="mt-1 text-sm text-gray-500">
          From store · Distributed {new Date(dist.distributed_at).toLocaleDateString()}
        </p>
      </div>

      <p className="text-sm text-gray-600">
        For each product below, enter the quantity you actually received. Leave unchanged if it matches what was sent.
      </p>

      <div className="space-y-3">
        {(dist.items ?? []).map(item => {
          const qty = received[item.id] ?? item.quantity_sent
          const hasDiscrepancy = qty !== item.quantity_sent
          return (
            <div
              key={item.id}
              className={`flex items-center gap-4 rounded-md border p-3 ${hasDiscrepancy ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
            >
              <span className="flex-1 text-sm font-medium text-gray-800">{item.product_name}</span>
              <span className="text-xs text-gray-500 whitespace-nowrap">Sent: <strong>{item.quantity_sent}</strong></span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={qty}
                  onChange={e => setReceived(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                  aria-label={`Received quantity for ${item.product_name}`}
                  className={`w-20 rounded border h-8 px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary-600 ${hasDiscrepancy ? 'border-amber-400' : 'border-gray-300'}`}
                />
                <span className="text-xs text-gray-400">received</span>
              </div>
              {hasDiscrepancy && (
                <span className="text-xs font-medium text-amber-600 whitespace-nowrap">
                  {qty - item.quantity_sent > 0 ? '+' : ''}{qty - item.quantity_sent}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => navigate('/distributions')}
          className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex-1 rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Submitting…' : 'Submit Verification'}
        </button>
      </div>
    </form>
  )
}
