import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { purchasesApi, type CreatePurchasePayload } from '@/api/purchases'
import { productsApi, type Product } from '@/api/products'

interface LineItem {
  product: Product
  quantity: number
  unit_cost: number
  expiry_date: string
  batch_number: string
}

export default function NewPurchasePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [supplierName, setSupplierName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: products } = useQuery({
    queryKey: ['products', 'search', productSearch],
    queryFn: () => productsApi.list({ search: productSearch, per_page: 50 }).then(r => r.data.data),
    enabled: productSearch.length >= 1,
  })

  const mutation = useMutation({
    mutationFn: (data: CreatePurchasePayload) => purchasesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-expiry'] })
      qc.invalidateQueries({ queryKey: ['stock-low'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/purchases')
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to record purchase.'),
  })

  const filtered = (products ?? []).filter(p => !items.find(i => i.product.id === p.id))

  const addProduct = (p: Product) => {
    setItems(prev => [...prev, { product: p, quantity: 1, unit_cost: Number(p.latest_cost), expiry_date: '', batch_number: '' }])
    setProductSearch('')
  }

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    const safeValue = typeof value === 'number' && isNaN(value) ? 0 : value
    setItems(prev => prev.map((i, j) => j === idx ? { ...i, [field]: safeValue } : i))
  }

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (items.length === 0) { setError('Add at least one product.'); return }
    mutation.mutate({
      purchase_date: new Date().toISOString().split('T')[0],
      supplier_name: supplierName || undefined,
      invoice_number: invoiceNumber || undefined,
      items: items.map(i => ({
        product_id: i.product.id,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
        expiry_date: i.product.category_name !== 'Hair' ? (i.expiry_date || undefined) : undefined,
        batch_number: i.batch_number || undefined,
      })),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Record Purchase</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Supplier Name</label>
          <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Invoice Number</label>
          <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Products Purchased</label>
        <div className="relative">
          <input type="text" placeholder="Search products…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
            className="block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          {productSearch && filtered.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              {filtered.slice(0, 8).map(p => (
                <button key={p.id} type="button" onClick={() => addProduct(p)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50">
                  <Plus size={14} className="text-primary-600" /> {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="mt-3 space-y-3">
            {items.map((item, idx) => (
              <div key={item.product.id} className="rounded-md border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.product.name}</span>
                  <button
                    type="button"
                    onClick={() => setItems(p => p.filter((_, j) => j !== idx))}
                    className="text-gray-300 hover:text-red-500"
                    aria-label={`Remove ${item.product.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className={`grid gap-2 text-xs ${item.product.category_name === 'Hair' ? 'grid-cols-3' : 'grid-cols-4'}`}>
                  <div>
                    <label htmlFor={`purchase-qty-${item.product.id}`} className="text-gray-500">Qty</label>
                    <input
                      id={`purchase-qty-${item.product.id}`}
                      type="number" min={1} value={item.quantity}
                      onChange={e => updateItem(idx, 'quantity', e.target.value === '' ? 1 : Number(e.target.value))}
                      className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
                    />
                  </div>
                  <div>
                    <label htmlFor={`purchase-cost-${item.product.id}`} className="text-gray-500">Cost (TZS)</label>
                    <input
                      id={`purchase-cost-${item.product.id}`}
                      type="number" min={0} value={item.unit_cost}
                      onChange={e => updateItem(idx, 'unit_cost', e.target.value === '' ? 0 : Number(e.target.value))}
                      className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
                    />
                  </div>
                  <div>
                    <label htmlFor={`purchase-batch-${item.product.id}`} className="text-gray-500">Batch #</label>
                    <input
                      id={`purchase-batch-${item.product.id}`}
                      type="text" value={item.batch_number}
                      onChange={e => updateItem(idx, 'batch_number', e.target.value)}
                      className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
                    />
                  </div>
                  {item.product.category_name !== 'Hair' && (
                    <div>
                      <label htmlFor={`purchase-expiry-${item.product.id}`} className="text-gray-500">Expiry</label>
                      <input
                        id={`purchase-expiry-${item.product.id}`}
                        type="date" value={item.expiry_date}
                        onChange={e => updateItem(idx, 'expiry_date', e.target.value)}
                        className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => navigate('/purchases')} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={mutation.isPending} className="rounded-md bg-primary-600 px-6 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {mutation.isPending ? 'Recording…' : 'Record Purchase'}
        </button>
      </div>
    </form>
  )
}
