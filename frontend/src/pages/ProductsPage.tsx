import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, Pencil } from 'lucide-react'
import { productsApi, type Product } from '@/api/products'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

export default function ProductsPage() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => productsApi.list({ page, search: search || undefined }).then(r => r.data),
  })

  const isAdmin = user?.role === 'admin'

  const columns = [
    { key: 'name', header: 'Product' },
    { key: 'sku', header: 'SKU', render: (p: Product) => p.sku ?? '—' },
    { key: 'category_name', header: 'Category', render: (p: Product) => p.category_name ?? '—' },
    { key: 'retail_price', header: 'Retail (TZS)', render: (p: Product) => Number(p.retail_price).toLocaleString('en-US') },
    { key: 'wholesale_price', header: 'Wholesale (TZS)', render: (p: Product) => Number(p.wholesale_price).toLocaleString('en-US') },
    { key: 'latest_cost', header: 'Cost (TZS)', render: (p: Product) => Number(p.latest_cost).toLocaleString('en-US') },
    { key: 'is_active', header: 'Status', render: (p: Product) => <Badge variant={p.is_active ? 'success' : 'default'}>{p.is_active ? 'Active' : 'Inactive'}</Badge> },
    ...(isAdmin ? [{
      key: 'edit',
      header: '',
      render: (p: Product) => (
        <Link
          to={`/products/${p.id}/edit`}
          className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
        >
          <Pencil size={12} /> Edit
        </Link>
      ),
    }] : []),
  ]

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
