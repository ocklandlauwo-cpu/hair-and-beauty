import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Pencil, Trash2 } from 'lucide-react'
import { productsApi, type Product } from '@/api/products'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

export default function ProductsPage() {
  const { user } = useAuth()
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Products</h1>
        <div className="flex items-center gap-3">
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
    </div>
  )
}
