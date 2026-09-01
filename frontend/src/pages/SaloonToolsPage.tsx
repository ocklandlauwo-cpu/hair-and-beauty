import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { saloonToolsApi } from '@/api/saloonTools'
import { locationsApi } from '@/api/locations'
import DataTable from '@/components/ui/DataTable'

function fmt(n: string | number) {
  return Number(n).toLocaleString('en-US')
}

const todayStr = new Date().toISOString().split('T')[0]

export default function SaloonToolsPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [locationId, setLocationId] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayStr)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['saloon-tools', page],
    queryFn: () => saloonToolsApi.list({ page }).then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: () => saloonToolsApi.create({
      location_id: Number(locationId),
      name,
      quantity: Number(quantity),
      unit_cost: Number(unitCost),
      purchase_date: purchaseDate,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saloon-tools'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setName('')
      setQuantity('1')
      setUnitCost('')
      setError(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      setError((err as ApiErr)?.response?.data?.message ?? 'Failed to record purchase.')
      setSuccess(false)
    },
  })

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!locationId) { setError('Select a shop.'); return }
    if (!name.trim()) { setError('Enter an item name.'); return }
    const parsedQty = Number(quantity)
    if (!quantity || isNaN(parsedQty) || parsedQty < 1) { setError('Quantity must be at least 1.'); return }
    const parsedCost = Number(unitCost)
    if (!unitCost || isNaN(parsedCost) || parsedCost < 0) { setError('Enter a valid unit cost.'); return }
    setError(null)
    mutation.mutate()
  }

  const activeShops = (locationsData ?? []).filter(l => l.type === 'shop' && l.is_active)

  const columns = [
    { key: 'purchase_date', header: 'Date', render: (t: { purchase_date: string }) => new Date(t.purchase_date).toLocaleDateString() },
    { key: 'location_name', header: 'Shop' },
    { key: 'name', header: 'Item' },
    { key: 'quantity', header: 'Quantity' },
    { key: 'unit_cost', header: 'Unit Cost (TZS)', render: (t: { unit_cost: string }) => fmt(t.unit_cost) },
    { key: 'total', header: 'Total (TZS)', render: (t: { total: number }) => fmt(t.total) },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Saloon Tools</h1>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end rounded-lg border border-gray-200 p-4">
        <div>
          <label htmlFor="st-shop" className="block text-xs font-medium text-gray-500 mb-1">Shop</label>
          {locationsData ? (
            <select id="st-shop" value={locationId} onChange={e => setLocationId(e.target.value)}
              className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="">— Select shop —</option>
              {activeShops.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : (
            <p className="flex h-9 items-center text-sm text-gray-400">Loading shops…</p>
          )}
        </div>
        <div>
          <label htmlFor="st-name" className="block text-xs font-medium text-gray-500 mb-1">Item Name</label>
          <input id="st-name" type="text" value={name} onChange={e => setName(e.target.value)}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="st-qty" className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
          <input id="st-qty" type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)}
            className="w-24 rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="st-cost" className="block text-xs font-medium text-gray-500 mb-1">Unit Cost (TZS)</label>
          <input id="st-cost" type="number" min="0" step="1" value={unitCost} onChange={e => setUnitCost(e.target.value)}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="st-date" className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input id="st-date" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <button type="submit" disabled={mutation.isPending}
          className="h-9 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {mutation.isPending ? 'Saving…' : 'Add Purchase'}
        </button>
      </form>

      {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Purchase recorded.</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No tool purchases logged yet." />

      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {data.meta.current_page} of {data.meta.last_page}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50">
              Previous
            </button>
            <button disabled={page === data.meta.last_page} onClick={() => setPage(p => p + 1)}
              className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
