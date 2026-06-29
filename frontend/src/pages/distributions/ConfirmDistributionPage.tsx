import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { distributionsApi } from '@/api/distributions'
import { productsApi } from '@/api/products'

export default function ConfirmDistributionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: dist, isLoading } = useQuery({
    queryKey: ['distribution', id],
    queryFn: () => distributionsApi.show(Number(id)).then(r => r.data.data),
  })

  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list().then(r => r.data.data),
  })

  const [received, setReceived] = useState<Record<number, number>>({})
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof distributionsApi.confirm>[1]) =>
      distributionsApi.confirm(Number(id), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['distributions'] }); navigate('/distributions') },
    onError: () => setError('Failed to confirm. Please try again.'),
  })

  if (isLoading || !dist) return <div className="p-6 text-sm text-gray-400">Loading…</div>

  const getProductName = (productId: number) =>
    products?.find(p => p.id === productId)?.name ?? `Product #${productId}`

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const items = (dist.items ?? []).map(item => ({
      distribution_item_id: item.id,
      quantity_received: received[item.id] ?? item.quantity_sent,
    }))
    mutation.mutate({ items })
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Confirm Distribution #{id}</h1>
      <p className="text-sm text-gray-500">
        Distributed: {new Date(dist.distributed_at).toLocaleDateString()}
      </p>

      <div className="space-y-3">
        {(dist.items ?? []).map(item => (
          <div key={item.id} className="flex items-center gap-4 rounded-md border border-gray-200 p-3">
            <span className="flex-1 text-sm">{getProductName(item.product_id)}</span>
            <span className="text-xs text-gray-500">Sent: {item.quantity_sent}</span>
            <input
              type="number"
              min={0}
              defaultValue={item.quantity_sent}
              onChange={e => setReceived(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
              className="w-20 rounded border border-gray-300 h-8 px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
            <span className="text-xs text-gray-400">received</span>
          </div>
        ))}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => navigate('/distributions')} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={mutation.isPending} className="rounded-md bg-primary-600 px-6 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {mutation.isPending ? 'Confirming…' : 'Confirm Receipt'}
        </button>
      </div>
    </form>
  )
}
