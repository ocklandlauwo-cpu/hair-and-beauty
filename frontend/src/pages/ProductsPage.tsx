import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Pencil, Trash2, X, Package, HelpCircle } from 'lucide-react'
import { productsApi, type Product } from '@/api/products'
import { askedProductsApi, type AskedProduct } from '@/api/askedProducts'
import { locationsApi } from '@/api/locations'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

// ── Add Asked Product Modal ────────────────────────────────────────────────
function AddAskedProductModal({ onClose, canFilterByShop }: { onClose: () => void; canFilterByShop: boolean }) {
  const qc = useQueryClient()
  const [productName, setProductName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
    enabled: canFilterByShop,
  })

  const mutation = useMutation({
    mutationFn: () => askedProductsApi.create({
      product_name: productName.trim(),
      ...(canFilterByShop && locationId ? { location_id: Number(locationId) } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asked-products'] })
      onClose()
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
      const data = (err as ApiErr)?.response?.data
      const fieldErrors = data?.errors
      const firstField = fieldErrors ? Object.values(fieldErrors)[0]?.[0] : undefined
      setError(firstField ?? data?.message ?? 'Failed to save. Please try again.')
    },
  })

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!productName.trim()) { setError('Product name is required.'); return }
    if (canFilterByShop && !locationId) { setError('Select a shop.'); return }
    setError(null)
    mutation.mutate()
  }

  const activeLocations = (locations ?? []).filter(l => l.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Add Asked Product</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="ap-name" className="block text-sm font-medium text-gray-700">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              id="ap-name"
              type="text"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              autoFocus
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
          </div>

          {canFilterByShop && (
            <div>
              <label htmlFor="ap-shop" className="block text-sm font-medium text-gray-700">
                Shop <span className="text-red-500">*</span>
              </label>
              <select
                id="ap-shop"
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              >
                <option value="">— Select shop —</option>
                {activeLocations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-10 px-4 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="h-10 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Asked Products Tab ──────────────────────────────────────────────────────
function AskedProductsTab({ role, isAdmin }: { role: string | undefined; isAdmin: boolean }) {
  const canFilterByShop = role === 'admin' || role === 'store_keeper'

  const [page, setPage] = useState(1)
  const [locationId, setLocationId] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [pendingIncrementId, setPendingIncrementId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const qc = useQueryClient()

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
    enabled: canFilterByShop,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['asked-products', page, locationId],
    queryFn: () => askedProductsApi.list(page, locationId ? Number(locationId) : undefined).then(r => r.data),
  })

  const incrementMutation = useMutation({
    mutationFn: (id: number) => askedProductsApi.increment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asked-products'] })
      setPendingIncrementId(null)
    },
    onError: () => setPendingIncrementId(null),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => askedProductsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asked-products'] })
      setConfirmDeleteId(null)
    },
    onError: () => setConfirmDeleteId(null),
  })

  const columns = useMemo(() => [
    { key: 'product_name', header: 'Product' },
    {
      key: 'updated_at',
      header: 'Recent Date Asked',
      render: (a: AskedProduct) => new Date(a.updated_at).toLocaleDateString(),
    },
    {
      key: 'times_asked',
      header: 'Times Asked',
      render: (a: AskedProduct) => <span className="font-semibold text-gray-800">{a.times_asked}</span>,
    },
    { key: 'location_name', header: 'Shop', render: (a: AskedProduct) => a.location_name ?? '—' },
    {
      key: 'actions',
      header: '',
      render: (a: AskedProduct) => (
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setPendingIncrementId(a.id); incrementMutation.mutate(a.id) }}
            disabled={pendingIncrementId === a.id}
            aria-label={`Increase asked count for ${a.product_name}`}
            className="flex items-center gap-1 text-xs text-primary-600 hover:underline disabled:opacity-50"
          >
            <Plus size={12} /> {pendingIncrementId === a.id ? '…' : 'Asked Again'}
          </button>
          {isAdmin && (
            confirmDeleteId === a.id ? (
              <span className="flex items-center gap-2">
                <button
                  onClick={() => deleteMutation.mutate(a.id)}
                  disabled={deleteMutation.isPending}
                  className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded disabled:opacity-50"
                >
                  {deleteMutation.isPending ? '…' : 'Confirm'}
                </button>
                <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDeleteId(a.id)}
                aria-label={`Delete ${a.product_name}`}
                className="flex items-center gap-1 text-xs text-red-500 hover:underline"
              >
                <Trash2 size={12} /> Delete
              </button>
            )
          )}
        </div>
      ),
    },
  ], [isAdmin, pendingIncrementId, incrementMutation.mutate, confirmDeleteId, deleteMutation.mutate, deleteMutation.isPending])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Asked Products</h2>
          <p className="mt-1 text-sm text-gray-500">
            Products customers have asked for. Log a new ask, or bump an existing one when asked again.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {canFilterByShop && (
            <select
              value={locationId}
              onChange={e => { setLocationId(e.target.value); setPage(1) }}
              className="h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            >
              <option value="">All Shops</option>
              {(locations ?? []).filter(l => l.is_active).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-9 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus size={16} /> Add Asked Product
          </button>
        </div>
      </div>

      {data && (
        <p className="text-sm text-gray-500">
          {data.meta.total} asked product{data.meta.total !== 1 ? 's' : ''}
        </p>
      )}

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="No asked products logged yet."
      />

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

      {showAdd && (
        <AddAskedProductModal onClose={() => setShowAdd(false)} canFilterByShop={canFilterByShop} />
      )}
    </div>
  )
}

export default function ProductsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'catalog' | 'asked'>('catalog')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pendingToggleId, setPendingToggleId] = useState<number | null>(null)

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => productsApi.list({ page, search: search || undefined }).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      setConfirmDeleteId(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      const msg = (err as ApiErr)?.response?.data?.message ?? 'Delete failed. Please try again.'
      setDeleteError(msg)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      productsApi.update(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      setPendingToggleId(null)
    },
    onError: () => setPendingToggleId(null),
  })

  const isAdmin = user?.role === 'admin'

  const columns = useMemo(() => [
    { key: 'name', header: 'Product' },
    { key: 'category_name', header: 'Category', render: (p: Product) => p.category_name ?? '—' },
    { key: 'retail_price', header: 'Retail (TZS)', render: (p: Product) => Number(p.retail_price).toLocaleString('en-US') },
    { key: 'wholesale_price', header: 'Wholesale (TZS)', render: (p: Product) => Number(p.wholesale_price).toLocaleString('en-US') },
    { key: 'wholesale_threshold', header: 'Wholesale Qty', render: (p: Product) => p.wholesale_threshold },
    { key: 'is_active', header: 'Status', render: (p: Product) => <Badge variant={p.is_active ? 'success' : 'default'}>{p.is_active ? 'Active' : 'Inactive'}</Badge> },
    ...(isAdmin ? [{
      key: 'actions',
      header: '',
      render: (p: Product) => (
        <div className="flex items-center gap-3">
          <Link
            to={`/products/${p.id}/edit`}
            className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            <Pencil size={12} /> Edit
          </Link>
          <button
            onClick={() => {
              setPendingToggleId(p.id)
              toggleMutation.mutate({ id: p.id, is_active: !p.is_active })
            }}
            disabled={pendingToggleId === p.id}
            aria-label={p.is_active ? `Deactivate ${p.name}` : `Activate ${p.name}`}
            className={`text-xs hover:underline disabled:opacity-50 ${p.is_active ? 'text-orange-500' : 'text-green-600'}`}
          >
            {pendingToggleId === p.id ? '…' : p.is_active ? 'Deactivate' : 'Activate'}
          </button>
          {confirmDeleteId === p.id ? (
            <span className="flex flex-col gap-1 items-start">
              <span className="flex items-center gap-2">
                <button
                  onClick={() => { setDeleteError(null); deleteMutation.mutate(p.id) }}
                  disabled={deleteMutation.isPending}
                  className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded disabled:opacity-50"
                >
                  {deleteMutation.isPending ? '…' : 'Confirm'}
                </button>
                <button
                  onClick={() => { setConfirmDeleteId(null); setDeleteError(null) }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </span>
              {deleteError && (
                <span className="text-xs text-red-600">{deleteError}</span>
              )}
            </span>
          ) : (
            <button
              onClick={() => { setConfirmDeleteId(p.id); setDeleteError(null) }}
              aria-label={`Delete ${p.name}`}
              className="flex items-center gap-1 text-xs text-red-500 hover:underline"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      ),
    }] : []),
  ], [isAdmin, confirmDeleteId, deleteError, pendingToggleId, deleteMutation.isPending, toggleMutation.isPending])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Products</h1>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          ['catalog', 'Catalog',        Package],
          ['asked',   'Asked Products', HelpCircle],
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

      {tab === 'catalog' && (
        <>
          <div className="flex items-center justify-end gap-3 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search products…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 pr-3 h-9 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
            {isAdmin && (
              <Link
                to="/products/new"
                className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-9 text-sm font-medium text-white hover:bg-primary-700"
              >
                <Plus size={16} /> New Product
              </Link>
            )}
          </div>

          <DataTable
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            emptyMessage="No products found."
          />

          {data && data.meta.last_page > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Page {data.meta.current_page} of {data.meta.last_page} ({data.meta.total} total)</span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  disabled={page === data.meta.last_page}
                  onClick={() => setPage(p => p + 1)}
                  className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'asked' && <AskedProductsTab role={user?.role} isAdmin={isAdmin} />}
    </div>
  )
}
