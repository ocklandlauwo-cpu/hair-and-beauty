import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { salesApi, type CreateSalePayload } from '@/api/sales'
import { productsApi, type Product } from '@/api/products'
import { clientsApi } from '@/api/clients'
import { locationsApi } from '@/api/locations'
import { stockApi } from '@/api/stock'
import { useAuth } from '@/contexts/AuthContext'

const PAYMENT_METHODS = ['nmb', 'airtel', 'vodacom', 'tigo', 'cash'] as const

const PAYMENT_LABELS: Record<typeof PAYMENT_METHODS[number], string> = {
  nmb:     'NMB',
  airtel:  'AIRTEL (LIPA)',
  vodacom: 'VODACOM (LIPA)',
  tigo:    'TIGO (LIPA)',
  cash:    'CASH',
}

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
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>('nmb')
  const [discount, setDiscount] = useState(0)
  const [clientId, setClientId] = useState<number | ''>('')
  const [locationId, setLocationId] = useState<number | ''>('')
  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list({ page: 1 }).then(r => r.data.data),
  })
  // Effective location: admin picks one, seller uses their own
  const effectiveLocationId = isAdmin
    ? (locationId || undefined)
    : (user?.location_id ?? undefined)

  const { data: clients } = useQuery({
    queryKey: ['clients', 'sale', effectiveLocationId],
    queryFn: () => clientsApi.list(1, effectiveLocationId).then(r => r.data.data),
    enabled: !!effectiveLocationId,
  })
  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
    enabled: isAdmin,
  })
  const { data: stockData } = useQuery({
    queryKey: ['stock'],
    queryFn: () => stockApi.current().then(r => r.data.data),
  })

  // product_id → stock qty for the active selling location
  const stockAtLocation = useMemo(() => {
    const effectiveLocId = isAdmin ? (locationId || null) : (user?.location_id ?? null)
    if (!effectiveLocId || !stockData) return null
    const map = new Map<number, number>()
    for (const row of stockData) {
      if (row.location_id === effectiveLocId) map.set(row.product_id, row.current_stock)
    }
    return map
  }, [stockData, locationId, isAdmin, user?.location_id])

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

  const filtered = (products ?? []).filter(p => {
    if (!p.name.toLowerCase().includes(productSearch.toLowerCase())) return false
    if (items.find(i => i.product.id === p.id)) return false
    // hide products with no stock at the selling location
    if (stockAtLocation && (stockAtLocation.get(p.id) ?? 0) <= 0) return false
    return true
  })

  const addProduct = (p: Product) => { setItems(prev => [...prev, computeItem(p, 1)]); setProductSearch('') }
  const updateQty = (idx: number, qty: number) => setItems(prev => prev.map((i, j) => j === idx ? computeItem(i.product, qty) : i))

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (items.length === 0) { setError('Add at least one product.'); return }
    if (isAdmin && !locationId) { setError('Select a location for this sale.'); return }
    mutation.mutate({
      payment_method: paymentMethod,
      sale_date: new Date().toISOString().split('T')[0],
      location_id: isAdmin && locationId ? Number(locationId) : undefined,
      client_id: clientId || undefined,
      discount_amount: discount || undefined,
      items: items.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">New Sale</h1>

      {/* Admin-only: location selector */}
      {isAdmin && (
        <div>
          <label htmlFor="sale-location" className="block text-sm font-medium text-gray-700">
            Sale Location <span className="text-red-500">*</span>
          </label>
          <select
            id="sale-location"
            value={locationId}
            onChange={e => { setLocationId(e.target.value === '' ? '' : Number(e.target.value)); setClientId('') }}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            required
          >
            <option value="">— Select location —</option>
            {(locationsData ?? []).filter(l => l.is_active).map(l => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.type})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">Stock will be deducted from this location.</p>
        </div>
      )}

      {/* Product search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>
        <div className="relative">
          <input type="text" placeholder="Search products to add…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
            disabled={isAdmin && !locationId}
            className="block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600 disabled:bg-gray-50 disabled:text-gray-400" />
          {isAdmin && !locationId && (
            <p className="mt-1 text-xs text-gray-400">Select a location above to see available stock.</p>
          )}
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
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => updateQty(idx, Number(e.target.value))}
                        aria-label={`Quantity for ${item.product.name}`}
                        className="w-16 rounded border border-gray-300 h-8 px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
                      />
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

      {/* Client (optional) */}
      <div>
        <label htmlFor="sale-client" className="block text-sm font-medium text-gray-700">
          Client <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <select
          id="sale-client"
          value={clientId}
          onChange={e => setClientId(e.target.value === '' ? '' : Number(e.target.value))}
          className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        >
          <option value="">— No client —</option>
          {(clients ?? []).map(c => (
            <option key={c.id} value={c.id}>
              {c.name}{c.phone ? ` (${c.phone})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Payment + discount */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sale-payment" className="block text-sm font-medium text-gray-700">Payment Method</label>
          <select id="sale-payment" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary-600">
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
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
