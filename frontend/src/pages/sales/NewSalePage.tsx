import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { salesApi, type CreateSalePayload } from '@/api/sales'
import { productsApi, type Product } from '@/api/products'

const PAYMENT_METHODS = ['nmb', 'airtel', 'vodacom', 'tigo'] as const

interface LineItem {
  product: Product
  quantity: number
  priceTier: 'wholesale' | 'retail'
  unitPrice: number
  lineTotal: number
}

function computeItem(product: Product, quantity: number): LineItem {
  const isWholesale = quantity >= product.wholesale_threshold
  const unitPrice = Number(isWholesale ? product.wholesale_price : product.retail_price)
  return { product, quantity, priceTier: isWholesale ? 'wholesale' : 'retail', unitPrice, lineTotal: unitPrice * quantity }
}

export default function NewSalePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>('nmb')
  const [discount, setDiscount] = useState(0)
  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: products } = useQuery({ queryKey: ['products', 'all'], queryFn: () => productsApi.list({ page: 1 }).then(r => r.data.data) })

  const mutation = useMutation({
    mutationFn: (data: CreateSalePayload) => salesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-expiry'] })
      qc.invalidateQueries({ queryKey: ['stock-low'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/sales')
    },
    onError: () => setError('Failed to record sale. Please try again.'),
  })

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.lineTotal, 0), [items])
  const total = Math.max(0, subtotal - discount)

  const filtered = (products ?? []).filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) && !items.find(i => i.product.id === p.id)
  )

  const addProduct = (p: Product) => { setItems(prev => [...prev, computeItem(p, 1)]); setProductSearch('') }
  const updateQty = (idx: number, qty: number) => setItems(prev => prev.map((i, j) => j === idx ? computeItem(i.product, qty) : i))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (items.length === 0) { setError('Add at least one product.'); return }
    mutation.mutate({
      payment_method: paymentMethod,
      sale_date: new Date().toISOString().split('T')[0],
      discount_amount: discount || undefined,
      items: items.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">New Sale</h1>

      {/* Product search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>
        <div className="relative">
          <input type="text" placeholder="Search products to add…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
            className="block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          {productSearch && filtered.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              {filtered.slice(0, 8).map(p => (
                <button key={p.id} type="button" onClick={() => addProduct(p)}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50">
                  <span className="flex items-center gap-2"><Plus size={14} className="text-primary-600" />{p.name}</span>
                  <span className="text-xs text-gray-400">{Number(p.retail_price).toLocaleString('en-US')} TZS</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line items */}
        {items.length > 0 && (
          <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-center">Qty</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, idx) => (
                  <tr key={item.product.id}>
                    <td className="px-4 py-2">
                      {item.product.name}
                      <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{item.priceTier}</span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input type="number" min={1} value={item.quantity} onChange={e => updateQty(idx, Number(e.target.value))}
                        className="w-16 rounded border border-gray-300 h-8 px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{item.unitPrice.toLocaleString('en-US')}</td>
                    <td className="px-4 py-2 text-right font-medium">{item.lineTotal.toLocaleString('en-US')}</td>
                    <td className="px-2">
                      <button
                        type="button"
                        onClick={() => setItems(p => p.filter((_, j) => j !== idx))}
                        className="text-gray-300 hover:text-red-500"
                        aria-label={`Remove ${item.product.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment + discount */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sale-payment" className="block text-sm font-medium text-gray-700">Payment Method</label>
          <select id="sale-payment" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary-600">
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sale-discount" className="block text-sm font-medium text-gray-700">Discount (TZS)</label>
          <input id="sale-discount" type="number" min={0} value={discount} onChange={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); setDiscount(isNaN(v) ? 0 : v) }}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
      </div>

      {/* Total */}
      <div className="rounded-lg border border-gray-200 p-4 text-right space-y-1">
        <div className="text-sm text-gray-500">Subtotal: {subtotal.toLocaleString('en-US')} TZS</div>
        {discount > 0 && <div className="text-sm text-gray-500">Discount: -{discount.toLocaleString('en-US')} TZS</div>}
        <div className="text-lg font-semibold text-gray-900">Total: {total.toLocaleString('en-US')} TZS</div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => navigate('/sales')} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={mutation.isPending || items.length === 0}
          className="flex-1 rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {mutation.isPending ? 'Recording…' : `Record Sale — ${total.toLocaleString('en-US')} TZS`}
        </button>
      </div>
    </form>
  )
}
