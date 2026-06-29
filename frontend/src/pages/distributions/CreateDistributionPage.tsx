import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { distributionsApi } from '@/api/distributions'
import { locationsApi } from '@/api/locations'
import { productsApi } from '@/api/products'

interface LineItem { product_id: number; product_name: string; quantity_sent: number }

export default function CreateDistributionPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [toLocationId, setToLocationId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: () => locationsApi.list().then(r => r.data.data) })
  const { data: products } = useQuery({ queryKey: ['products', 'all'], queryFn: () => productsApi.list({ page: 1 }).then(r => r.data.data) })

  const mutation = useMutation({
    mutationFn: distributionsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['distributions'] }); navigate('/distributions') },
    onError: () => setError('Failed to create distribution. Please try again.'),
  })

  const shops = (locations ?? []).filter(l => l.type === 'shop' && l.is_active)
  const filteredProducts = (products ?? []).filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) && !items.find(i => i.product_id === p.id)
  )

  const addProduct = (product: { id: number; name: string }) => {
    setItems(prev => [...prev, { product_id: product.id, product_name: product.name, quantity_sent: 1 }])
    setProductSearch('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!toLocationId || items.length === 0) { setError('Select a destination and at least one product.'); return }
    mutation.mutate({ to_location_id: Number(toLocationId), distributed_at: new Date().toISOString(), notes: notes || undefined, items: items.map(i => ({ product_id: i.product_id, quantity_sent: i.quantity_sent })) })
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">New Distribution</h1>

      <div>
        <label className="block text-sm font-medium text-gray-700">Destination Shop</label>
        <select value={toLocationId} onChange={e => setToLocationId(e.target.value)} required
          className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
          <option value="">Select shop…</option>
          {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>
        <div className="relative">
          <input type="text" placeholder="Search and add products…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
            className="block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          {productSearch && filteredProducts.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              {filteredProducts.slice(0, 8).map(p => (
                <button key={p.id} type="button" onClick={() => addProduct(p)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50">
                  <Plus size={14} className="text-primary-600" /> {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className="mt-3 space-y-2">
            {items.map((item, idx) => (
              <div key={item.product_id} className="flex items-center gap-3 rounded-md border border-gray-200 p-3">
                <span className="flex-1 text-sm">{item.product_name}</span>
                <input type="number" min={1} value={item.quantity_sent}
                  onChange={e => setItems(prev => prev.map((i, j) => j === idx ? { ...i, quantity_sent: Number(e.target.value) } : i))}
                  className="w-20 rounded border border-gray-300 h-8 px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary-600" />
                <span className="text-xs text-gray-400">units</span>
                <button type="button" onClick={() => setItems(prev => prev.filter((_, j) => j !== idx))} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => navigate('/distributions')} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={mutation.isPending} className="rounded-md bg-primary-600 px-6 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {mutation.isPending ? 'Creating…' : 'Create Distribution'}
        </button>
      </div>
    </form>
  )
}
