import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeftRight, ChevronDown, ChevronRight, Clock, Package, Pencil, Search, Warehouse, X } from 'lucide-react'
import { stockApi, type StockRow, type ExpiryAlert, type LowStockAlert, type MovementType } from '@/api/stock'
import { distributionsApi } from '@/api/distributions'
import { locationsApi } from '@/api/locations'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

type Tab = 'current' | 'inventory' | 'expiry' | 'low'

// ── Movement label + colour map ────────────────────────────────────────────
const MOVEMENT_META: Record<MovementType, { label: string; increase: boolean | null }> = {
  purchase:         { label: 'Purchase',         increase: true  },
  distribution_in:  { label: 'Distribution In',  increase: true  },
  sale_revert:      { label: 'Sale Revert',       increase: true  },
  distribution_out: { label: 'Distribution Out',  increase: false },
  sale:             { label: 'Sale',              increase: false },
  adjustment:       { label: 'Adjustment',        increase: null  },
}

// ── Movements expansion panel (lazy-fetched per row) ──────────────────────
function MovementsPanel({ productId, locationId }: { productId: number; locationId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-movements', productId, locationId],
    queryFn: () => stockApi.movements(productId, locationId).then(r => r.data.data),
    staleTime: 30_000,
  })

  if (isLoading) {
    return <p className="px-6 py-3 text-xs text-gray-400">Loading movements…</p>
  }
  if (!data?.length) {
    return <p className="px-6 py-3 text-xs text-gray-400">No movements recorded for this product.</p>
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-200 text-left text-gray-500">
          <th className="px-6 py-2 font-medium">Date</th>
          <th className="px-6 py-2 font-medium">Status</th>
          <th className="px-6 py-2 font-medium">Qty</th>
        </tr>
      </thead>
      <tbody>
        {data.map(m => {
          const meta = MOVEMENT_META[m.movement_type]
          const isIncrease = meta.increase === null ? m.quantity > 0 : meta.increase
          return (
            <tr key={m.id} className="border-b border-gray-100 last:border-0">
              <td className="px-6 py-2 text-gray-500">
                {new Date(m.created_at).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </td>
              <td className="px-6 py-2">
                <Badge variant={isIncrease ? 'success' : 'danger'}>{meta.label}</Badge>
              </td>
              <td className={`px-6 py-2 font-semibold ${isIncrease ? 'text-green-600' : 'text-red-500'}`}>
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Move Stock Modal (shop-to-shop transfer) ───────────────────────────────
interface MoveStockModalProps {
  row: StockRow
  onClose: () => void
}

function MoveStockModal({ row, onClose }: MoveStockModalProps) {
  const qc = useQueryClient()
  const [toLocationId, setToLocationId] = useState('')
  const [qty, setQty] = useState('1')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: () => locationsApi.list().then(r => r.data.data) })
  const destinationShops = (locations ?? []).filter(l => l.type === 'shop' && l.is_active && l.id !== row.location_id)

  const mutation = useMutation({
    mutationFn: () => distributionsApi.create({
      from_location_id: row.location_id,
      to_location_id: Number(toLocationId),
      distributed_at: new Date().toISOString(),
      notes: notes || undefined,
      items: [{ product_id: row.product_id, quantity_sent: Number(qty) }],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-low'] })
      qc.invalidateQueries({ queryKey: ['distributions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      setError((err as ApiErr)?.response?.data?.message ?? 'Transfer failed.')
    },
  })

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    const n = Number(qty)
    if (!toLocationId) { setError('Select a destination shop.'); return }
    if (!qty || isNaN(n) || n < 1) { setError('Enter a valid quantity (1 or more).'); return }
    if (n > row.current_stock) { setError(`Only ${row.current_stock} units available at ${row.location_name}.`); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Move Stock to Another Shop</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm space-y-1">
          <p className="font-medium text-gray-800">{row.product_name}</p>
          <p className="text-gray-500">From {row.location_name} &middot; Available: <span className="font-semibold text-gray-800">{row.current_stock}</span></p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="move-dest" className="block text-sm font-medium text-gray-700">
              Destination Shop <span className="text-red-500">*</span>
            </label>
            <select
              id="move-dest"
              value={toLocationId}
              onChange={e => setToLocationId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            >
              <option value="">Select shop…</option>
              {destinationShops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="move-qty" className="block text-sm font-medium text-gray-700">
              Quantity <span className="text-red-500">*</span>
            </label>
            <input
              id="move-qty"
              type="number"
              min={1}
              max={row.current_stock}
              value={qty}
              onChange={e => setQty(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="move-notes" className="block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="move-notes"
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Shop 2 running low"
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 h-10 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Moving…' : 'Move Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Expandable current-stock table ─────────────────────────────────────────
function CurrentStockTable({ rows, isLoading, canTransfer }: { rows: StockRow[]; isLoading: boolean; canTransfer: boolean }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [movingRow, setMovingRow] = useState<StockRow | null>(null)

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
  }
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-400">No stock data.</div>
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-warm-200 bg-white">
      <table className="min-w-full divide-y divide-warm-100 text-sm">
        <thead className="bg-warm-50">
          <tr>
            <th className="w-8 px-3 py-3" />
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Product</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Location</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Stock</th>
            {canTransfer && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {rows.map(row => {
            const key = `${row.product_id}-${row.location_id}`
            const isOpen = expandedKey === key
            return (
              <>
                <tr
                  key={key}
                  className="cursor-pointer hover:bg-warm-50/60 transition-colors"
                  onClick={() => setExpandedKey(isOpen ? null : key)}
                >
                  <td className="w-8 px-3 py-3 text-gray-400">
                    {isOpen
                      ? <ChevronDown size={14} />
                      : <ChevronRight size={14} />
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.product_name}</td>
                  <td className="px-4 py-3 text-gray-700">{row.location_name}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <Badge>{row.location_type}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className={row.current_stock < 0 ? 'font-medium text-red-600' : 'text-gray-700'}>
                      {row.current_stock}
                    </span>
                  </td>
                  {canTransfer && (
                    <td className="px-4 py-3">
                      {row.location_type === 'shop' && (
                        <button
                          onClick={e => { e.stopPropagation(); setMovingRow(row) }}
                          className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
                          aria-label={`Move ${row.product_name} from ${row.location_name} to another shop`}
                        >
                          <ArrowLeftRight size={12} /> Move
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {isOpen && (
                  <tr key={`${key}-expansion`} className="bg-blue-50/40">
                    <td colSpan={canTransfer ? 6 : 5} className="py-2">
                      <MovementsPanel productId={row.product_id} locationId={row.location_id} />
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>

      {movingRow && (
        <MoveStockModal row={movingRow} onClose={() => setMovingRow(null)} />
      )}
    </div>
  )
}

// ── Adjust Qty Modal ────────────────────────────────────────────────────────
interface AdjustModalProps {
  row: StockRow
  onClose: () => void
}

function AdjustModal({ row, onClose }: AdjustModalProps) {
  const qc = useQueryClient()
  const [qty, setQty] = useState(String(row.current_stock))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => stockApi.adjust({
      product_id: row.product_id,
      location_id: row.location_id,
      new_quantity: Number(qty),
      notes: notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-low'] })
      qc.invalidateQueries({ queryKey: ['stock-movements', row.product_id, row.location_id] })
      onClose()
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      setError((err as ApiErr)?.response?.data?.message ?? 'Adjustment failed.')
    },
  })

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    const n = Number(qty)
    if (!qty || isNaN(n) || n < 0) { setError('Enter a valid quantity (0 or more).'); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Adjust Stock Quantity</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm space-y-1">
          <p className="font-medium text-gray-800">{row.product_name}</p>
          <p className="text-gray-500">{row.location_name} &middot; Current qty: <span className="font-semibold text-gray-800">{row.current_stock}</span></p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="adj-qty" className="block text-sm font-medium text-gray-700">
              New Quantity <span className="text-red-500">*</span>
            </label>
            <input
              id="adj-qty"
              type="number"
              min={0}
              value={qty}
              onChange={e => setQty(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="adj-notes" className="block text-sm font-medium text-gray-700">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="adj-notes"
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Stock count correction"
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 h-10 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Inventory table (with admin edit) ──────────────────────────────────────
function InventoryTable({
  rows,
  isLoading,
  isAdmin,
}: {
  rows: StockRow[]
  isLoading: boolean
  isAdmin: boolean
}) {
  const [adjustingRow, setAdjustingRow] = useState<StockRow | null>(null)

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
  }
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-400">No inventory data.</div>
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-warm-200 bg-white">
        <table className="min-w-full divide-y divide-warm-100 text-sm">
          <thead className="bg-warm-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Product</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</th>
              {isAdmin && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-50">
            {rows.map(row => {
              const key = `${row.product_id}-${row.location_id}`
              return (
                <tr key={key} className="hover:bg-warm-50/60 transition-colors">
                  <td className="px-4 py-3 text-gray-700">{row.product_name}</td>
                  <td className="px-4 py-3 text-gray-600">{row.location_name}</td>
                  <td className="px-4 py-3">
                    <Badge>{row.location_type}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className={row.current_stock < 0 ? 'font-semibold text-red-600' : 'font-medium text-gray-800'}>
                      {row.current_stock}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setAdjustingRow(row)}
                        className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
                        aria-label={`Edit quantity for ${row.product_name} at ${row.location_name}`}
                      >
                        <Pencil size={12} /> Edit Qty
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {adjustingRow && (
        <AdjustModal row={adjustingRow} onClose={() => setAdjustingRow(null)} />
      )}
    </>
  )
}

// ── Expiry / Low-stock column defs ─────────────────────────────────────────
const expiryColumns = [
  { key: 'product_name', header: 'Product' },
  { key: 'batch_number', header: 'Batch', render: (r: ExpiryAlert) => r.batch_number ?? '—' },
  { key: 'expiry_date', header: 'Expires' },
  { key: 'days_until_expiry', header: 'Days Left', render: (r: ExpiryAlert) => (
    <Badge variant={r.days_until_expiry <= 14 ? 'danger' : r.days_until_expiry <= 30 ? 'warning' : 'default'}>
      {r.days_until_expiry}d
    </Badge>
  )},
]

const lowStockColumns = [
  { key: 'product_name', header: 'Product' },
  { key: 'location_name', header: 'Location' },
  { key: 'current_stock', header: 'Stock' },
  { key: 'avg_daily_sales', header: 'Avg Daily Sales', render: (r: LowStockAlert) => Number(r.avg_daily_sales).toFixed(1) },
  { key: 'days_of_cover', header: 'Days Cover', render: (r: LowStockAlert) => (
    <Badge variant={r.days_of_cover !== null && r.days_of_cover <= 7 ? 'danger' : 'warning'}>
      {r.days_of_cover ?? '—'}d
    </Badge>
  )},
]

// ── Page ──────────────────────────────────────────────────────────────────
export default function StockPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canTransfer = user?.role === 'admin' || user?.role === 'store_keeper'

  const [tab, setTab] = useState<Tab>('current')
  const [productSearch, setProductSearch] = useState('')
  const [locationId, setLocationId] = useState<string>('')

  const { data: currentData, isLoading: l1 } = useQuery({ queryKey: ['stock'], queryFn: () => stockApi.current().then(r => r.data.data) })
  const { data: expiryData, isLoading: l2 } = useQuery({ queryKey: ['stock-expiry'], queryFn: () => stockApi.expiryAlerts().then(r => r.data.data), enabled: tab === 'expiry' })
  const { data: lowData, isLoading: l3 } = useQuery({ queryKey: ['stock-low'], queryFn: () => stockApi.lowStockAlerts().then(r => r.data.data), enabled: tab === 'low' })

  const locationOptions = useMemo(() => {
    const rows = [...(currentData ?? []), ...(lowData ?? [])]
    const seen = new Map<number, string>()
    for (const r of rows) seen.set(r.location_id, r.location_name)
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [currentData, lowData])

  const q = productSearch.toLowerCase()

  const filteredCurrent = useMemo(() => (currentData ?? []).filter(r =>
    (!q || r.product_name.toLowerCase().includes(q) || r.location_name.toLowerCase().includes(q)) &&
    (!locationId || String(r.location_id) === locationId)
  ), [currentData, q, locationId])

  const filteredInventory = useMemo(() => (currentData ?? []).filter(r =>
    (!q || r.product_name.toLowerCase().includes(q) || r.location_name.toLowerCase().includes(q)) &&
    (!locationId || String(r.location_id) === locationId)
  ), [currentData, q, locationId])

  const filteredExpiry = useMemo(() => (expiryData ?? []).filter(r =>
    !q || r.product_name.toLowerCase().includes(q)
  ), [expiryData, q])

  const filteredLow = useMemo(() => (lowData ?? []).filter(r =>
    (!q || r.product_name.toLowerCase().includes(q) || r.location_name.toLowerCase().includes(q)) &&
    (!locationId || String(r.location_id) === locationId)
  ), [lowData, q, locationId])

  const resetFilters = () => { setProductSearch(''); setLocationId('') }
  const hasFilters = q || locationId

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Stock & Inventory</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search product or location…"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>

        <select
          value={locationId}
          onChange={e => setLocationId(e.target.value)}
          className="h-9 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          disabled={tab === 'expiry'}
        >
          <option value="">All locations</option>
          {locationOptions.map(([id, name]) => (
            <option key={id} value={String(id)}>{name}</option>
          ))}
        </select>

        {hasFilters && (
          <button onClick={resetFilters} className="h-9 px-3 text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2">
            Clear
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          ['current',   'Current Stock', Package],
          ['inventory', 'Inventory',     Warehouse],
          ['expiry',    'Expiry Alerts', Clock],
          ['low',       'Low Stock',     AlertTriangle],
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

      {tab === 'current' && (
        <CurrentStockTable rows={filteredCurrent} isLoading={l1} canTransfer={canTransfer} />
      )}
      {tab === 'inventory' && (
        <InventoryTable rows={filteredInventory} isLoading={l1} isAdmin={isAdmin} />
      )}
      {tab === 'expiry' && <DataTable columns={expiryColumns} data={filteredExpiry as ExpiryAlert[]} isLoading={l2} emptyMessage="No expiry alerts." />}
      {tab === 'low' && <DataTable columns={lowStockColumns} data={filteredLow as LowStockAlert[]} isLoading={l3} emptyMessage="No low stock alerts." />}
    </div>
  )
}
