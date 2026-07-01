import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react'
import { distributionsApi, type Distribution, type DistributionDetail } from '@/api/distributions'
import { useAuth } from '@/contexts/AuthContext'
import Badge from '@/components/ui/Badge'

const statusVariant = {
  pending: 'warning',
  confirmed: 'success',
  discrepancy: 'danger',
} as const

function DistributionItems({ id }: { id: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['distribution', id],
    queryFn: () => distributionsApi.show(id).then(r => r.data.data as DistributionDetail),
  })

  if (isLoading) return <p className="px-4 py-3 text-sm text-gray-400">Loading…</p>
  if (!data?.items?.length) return <p className="px-4 py-3 text-sm text-gray-400">No items.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-500 bg-gray-50">
          <th className="px-4 py-2 text-left font-medium">Product</th>
          <th className="px-4 py-2 text-right font-medium">Sent</th>
          <th className="px-4 py-2 text-right font-medium">Received</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {data.items.map(item => {
          const hasDiscrepancy = item.quantity_received !== null && item.quantity_received !== item.quantity_sent
          return (
            <tr key={item.id}>
              <td className="px-4 py-2 text-gray-800">{item.product_name}</td>
              <td className="px-4 py-2 text-right text-gray-600">{item.quantity_sent}</td>
              <td className={`px-4 py-2 text-right font-medium ${hasDiscrepancy ? 'text-red-600' : 'text-gray-700'}`}>
                {item.quantity_received ?? '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function DistributionsPage() {
  const { user } = useAuth()
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [shopSearch, setShopSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['distributions'],
    queryFn: () => distributionsApi.list().then(r => r.data),
  })

  const distributions: Distribution[] = data?.data ?? []

  const filtered = useMemo(() => {
    const q = shopSearch.toLowerCase()
    return q ? distributions.filter(d => (d.to_location_name ?? '').toLowerCase().includes(q)) : distributions
  }, [distributions, shopSearch])

  const toggle = (id: number) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Distributions</h1>
        {(user?.role === 'admin' || user?.role === 'store_keeper') && (
          <Link
            to="/distributions/new"
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus size={16} /> New Distribution
          </Link>
        )}
      </div>

      {/* Shop search */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search shop…"
          value={shopSearch}
          onChange={e => setShopSearch(e.target.value)}
          className="w-full h-9 pl-8 pr-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No distributions found.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="w-8" />
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Shop</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Confirmed</th>
                <th className="px-4 py-3 text-left font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <>
                  <tr
                    key={d.id}
                    onClick={() => toggle(d.id)}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="pl-3 text-gray-400">
                      {expandedId === d.id
                        ? <ChevronDown size={14} />
                        : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3 text-gray-500">#{d.id}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{d.to_location_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(d.distributed_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[d.status]}>{d.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {d.confirmed_at ? new Date(d.confirmed_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {d.status === 'pending' && (
                        <Link
                          to={`/distributions/${d.id}/confirm`}
                          className="text-primary-600 hover:underline text-xs"
                        >
                          Confirm
                        </Link>
                      )}
                    </td>
                  </tr>

                  {expandedId === d.id && (
                    <tr key={`${d.id}-items`} className="bg-gray-50/60">
                      <td colSpan={7} className="border-t border-gray-100">
                        <DistributionItems id={d.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
