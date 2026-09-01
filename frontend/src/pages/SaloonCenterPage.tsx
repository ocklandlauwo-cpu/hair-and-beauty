import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus } from 'lucide-react'
import { saloonSalesApi, type SaloonSale } from '@/api/saloonSales'
import { providersApi } from '@/api/providers'
import { saloonServicesApi } from '@/api/saloonServices'
import { locationsApi } from '@/api/locations'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'

const today = new Date()
const defaultDateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
const defaultDateTo   = today.toISOString().split('T')[0]

function fmt(n: string | number) {
  return Number(n).toLocaleString('en-US')
}

function LogSaleModal({ onClose, isAdmin }: { onClose: () => void; isAdmin: boolean }) {
  const qc = useQueryClient()
  const [locationId, setLocationId] = useState('')
  const [providerId, setProviderId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [saleDate, setSaleDate] = useState(defaultDateTo)
  const [error, setError] = useState<string | null>(null)

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
    enabled: isAdmin,
  })
  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.list().then(r => r.data.data),
  })
  const { data: services } = useQuery({
    queryKey: ['saloon-services'],
    queryFn: () => saloonServicesApi.list().then(r => r.data.data),
  })

  const mutation = useMutation({
    mutationFn: () => saloonSalesApi.create({
      ...(isAdmin && locationId ? { location_id: Number(locationId) } : {}),
      provider_id: Number(providerId),
      saloon_service_id: Number(serviceId),
      amount: Number(amount),
      sale_date: saleDate,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saloon-sales'] })
      onClose()
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      setError((err as ApiErr)?.response?.data?.message ?? 'Failed to log sale. Please try again.')
    },
  })

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (isAdmin && !locationId) { setError('Select a shop.'); return }
    if (!providerId) { setError('Select a provider.'); return }
    if (!serviceId) { setError('Select a service.'); return }
    const parsedAmount = Number(amount)
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) { setError('Enter a valid amount greater than 0.'); return }
    setError(null)
    mutation.mutate()
  }

  const activeShops     = (locations ?? []).filter(l => l.type === 'shop' && l.is_active)
  const activeProviders = (providers ?? []).filter(p => p.is_active)
  const activeServices  = (services ?? []).filter(s => s.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Log Saloon Sale</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isAdmin && (
            <div>
              <label htmlFor="ls-shop" className="block text-sm font-medium text-gray-700">Shop</label>
              <select id="ls-shop" value={locationId} onChange={e => setLocationId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
                <option value="">— Select shop —</option>
                {activeShops.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="ls-provider" className="block text-sm font-medium text-gray-700">Provider</label>
            <select id="ls-provider" value={providerId} onChange={e => setProviderId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="">— Select provider —</option>
              {activeProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="ls-service" className="block text-sm font-medium text-gray-700">Service</label>
            <select id="ls-service" value={serviceId} onChange={e => setServiceId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="">— Select service —</option>
              {activeServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="ls-amount" className="block text-sm font-medium text-gray-700">Amount (TZS)</label>
            <input id="ls-amount" type="number" min="0" step="1" value={amount} onChange={e => setAmount(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>

          <div>
            <label htmlFor="ls-date" className="block text-sm font-medium text-gray-700">Date</label>
            <input id="ls-date" type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-10 px-4 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="h-10 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Log Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SaloonCenterPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canLogSale = user?.role === 'admin' || user?.role === 'seller'

  const [locationId, setLocationId] = useState<number | ''>('')
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [page, setPage] = useState(1)
  const [showLogSale, setShowLogSale] = useState(false)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['saloon-sales', locationId, dateFrom, dateTo, page],
    queryFn: () => saloonSalesApi.list({ location_id: locationId || undefined, date_from: dateFrom, date_to: dateTo, page }).then(r => r.data),
  })

  const columns = [
    { key: 'sale_date', header: 'Date', render: (s: SaloonSale) => new Date(s.sale_date).toLocaleDateString() },
    { key: 'provider_name', header: 'Provider' },
    { key: 'service_name', header: 'Service' },
    { key: 'amount', header: 'Amount (TZS)', render: (s: SaloonSale) => fmt(s.amount), className: 'text-right' },
    { key: 'location_name', header: 'Shop' },
  ]

  const activeShops = (locationsData ?? []).filter(l => l.type === 'shop' && l.is_active)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Saloon Center</h1>
        {canLogSale && (
          <button onClick={() => setShowLogSale(true)}
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700">
            <Plus size={16} /> Log Sale
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="sc-shop" className="block text-xs font-medium text-gray-500 mb-1">Shop</label>
          <select id="sc-shop" value={locationId} onChange={e => { setLocationId(e.target.value === '' ? '' : Number(e.target.value)); setPage(1) }}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
            <option value="">All shops</option>
            {activeShops.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sc-from" className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input id="sc-from" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="sc-to" className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input id="sc-to" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No services logged for this period." />

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

      {showLogSale && <LogSaleModal onClose={() => setShowLogSale(false)} isAdmin={isAdmin} />}
    </div>
  )
}
