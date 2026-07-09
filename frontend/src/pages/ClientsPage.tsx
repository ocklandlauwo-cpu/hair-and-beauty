import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useController } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { Pencil, Plus, X, Search, Trash2, Bell, Share2, Copy, Download, Check } from 'lucide-react'
import { clientsApi, type Client } from '@/api/clients'
import { locationsApi } from '@/api/locations'
import { categoriesApi } from '@/api/categories'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

// ── Schema ─────────────────────────────────────────────────────────────────
function makeSchema(mode: 'create' | 'edit', isAdmin: boolean) {
  return z.object({
    name:        z.string().min(1, 'Name is required').max(100),
    phone:       z.string().max(20).nullable().optional(),
    notes:       z.string().nullable().optional(),
    location_id: isAdmin && mode === 'create'
      ? z.number({ error: 'Location is required' })
      : z.number().nullable().optional(),
    is_active:   z.boolean().optional(),
  })
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>

// ── Modal ──────────────────────────────────────────────────────────────────
type ModalProps =
  | { mode: 'create'; client?: never; onClose: () => void; isAdmin: boolean }
  | { mode: 'edit';   client: Client; onClose: () => void; isAdmin: boolean }

function ClientFormModal({ mode, client, onClose, isAdmin }: ModalProps) {
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })

  const schema = useMemo(() => makeSchema(mode, isAdmin), [mode, isAdmin])

  const { register, handleSubmit, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: mode === 'edit' && client
      ? {
          name:        client.name,
          phone:       client.phone ?? '',
          notes:       client.notes ?? '',
          location_id: client.location_id,
          is_active:   client.is_active,
        }
      : {
          name:        '',
          phone:       '',
          notes:       '',
          location_id: undefined,
          is_active:   true,
        },
  })

  const { field: locationField } = useController({ name: 'location_id', control })

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const phone = values.phone || null
      const notes = values.notes || null

      if (mode === 'create') {
        return clientsApi.create({
          name:        values.name,
          phone,
          notes,
          ...(isAdmin && values.location_id ? { location_id: values.location_id } : {}),
        })
      }
      return clientsApi.update(client.id, {
        name:        values.name,
        phone,
        notes,
        is_active:   values.is_active,
        ...(values.location_id ? { location_id: values.location_id } : {}),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      onClose()
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
      const data = (err as ApiErr)?.response?.data
      const fieldErrors = data?.errors
      const firstField = fieldErrors ? Object.values(fieldErrors)[0]?.[0] : undefined
      const base = data?.message ?? 'An error occurred. Please try again.'
      setServerError(firstField ? `${base}: ${firstField}` : base)
    },
  })

  const activeLocations = (locations ?? []).filter(l => l.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'create' ? 'Add Client' : 'Edit Client'}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit(values => { setServerError(null); mutation.mutate(values) })}
          className="space-y-4"
        >
          {/* Name */}
          <div>
            <label htmlFor="c-name" className="block text-sm font-medium text-gray-700">Name</label>
            <input id="c-name" type="text" {...register('name')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="c-phone" className="block text-sm font-medium text-gray-700">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input id="c-phone" type="tel" {...register('phone')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="c-notes" className="block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea id="c-notes" rows={3} {...register('notes')}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600 resize-none" />
            {errors.notes && <p className="mt-1 text-xs text-red-600">{errors.notes.message}</p>}
          </div>

          {/* Location — admin on create and edit */}
          {isAdmin && (
            <div>
              <label htmlFor="c-location" className="block text-sm font-medium text-gray-700">
                Shop / Location <span className="text-red-500">*</span>
              </label>
              <select
                id="c-location"
                value={locationField.value ?? ''}
                onChange={e => locationField.onChange(e.target.value === '' ? null : Number(e.target.value))}
                onBlur={locationField.onBlur}
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              >
                <option value="">— Select shop —</option>
                {activeLocations.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                ))}
              </select>
              {errors.location_id && (
                <p className="mt-1 text-xs text-red-600">{errors.location_id.message ?? 'Location is required'}</p>
              )}
            </div>
          )}

          {/* Is Active — edit only */}
          {mode === 'edit' && (
            <div className="flex items-center gap-2">
              <input id="c-active" type="checkbox" {...register('is_active')}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
              <label htmlFor="c-active" className="text-sm font-medium text-gray-700">Active</label>
            </div>
          )}

          {serverError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="h-10 px-4 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="h-10 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : mode === 'create' ? 'Add Client' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Campaign Export Modal ──────────────────────────────────────────────────
function CampaignExportModal({ onClose, isAdmin }: { onClose: () => void; isAdmin: boolean }) {
  const [daysInactive, setDaysInactive] = useState<number | ''>('')
  const [categoryId, setCategoryId]     = useState<number | ''>('')
  const [locationId, setLocationId]     = useState<number | ''>('')
  const [copied, setCopied]             = useState<'numbers' | 'list' | null>(null)

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then(r => r.data.data),
  })
  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
    enabled: isAdmin,
  })

  const { data, isFetching } = useQuery({
    queryKey: ['clients-export', locationId, daysInactive, categoryId],
    queryFn: () => clientsApi.list(
      1,
      locationId   || undefined,
      undefined,
      undefined,
      daysInactive || undefined,
      categoryId   || undefined,
    ).then(r => r.data.data.filter(c => c.phone)),
  })

  const clients = data ?? []

  const copy = (text: string, kind: 'numbers' | 'list') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const downloadCSV = () => {
    const rows = [
      ['Name', 'Phone', 'Shop', 'Last Purchase', 'Last Products'],
      ...clients.map(c => [
        c.name,
        c.phone ?? '',
        c.location_name ?? '',
        c.last_purchase_date ?? '',
        c.last_products ?? '',
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `whatsapp-campaign-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const numbersText = clients.map(c => c.phone).join('\n')
  const listText    = clients.map(c => `${c.name}: ${c.phone}`).join('\n')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">WhatsApp Campaign Export</h2>
            <p className="text-xs text-gray-400 mt-0.5">Filter clients, then copy or download</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Days without purchase</label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 30"
                value={daysInactive}
                onChange={e => setDaysInactive(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Product category bought</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              >
                <option value="">All categories</option>
                {(categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shop</label>
              <select
                value={locationId}
                onChange={e => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              >
                <option value="">All shops</option>
                {(locations ?? []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 min-h-[120px]">
          {isFetching ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : clients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No clients with phone numbers match the filters.</p>
          ) : (
            clients.map(c => (
              <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-800">{c.name}</span>
                  {c.last_products && (
                    <span className="ml-2 text-xs text-gray-400 truncate max-w-[180px] inline-block align-bottom" title={c.last_products}>
                      {c.last_products}
                    </span>
                  )}
                </div>
                <span className="text-sm text-primary-600 font-medium ml-3 shrink-0">{c.phone}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <div className="text-xs text-gray-500 mb-2">
            {clients.length} client{clients.length !== 1 ? 's' : ''} with phone numbers
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              disabled={clients.length === 0}
              onClick={() => copy(numbersText, 'numbers')}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              {copied === 'numbers' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {copied === 'numbers' ? 'Copied!' : 'Copy Numbers'}
            </button>
            <button
              disabled={clients.length === 0}
              onClick={() => copy(listText, 'list')}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              {copied === 'list' ? <Check size={14} className="text-green-600" /> : <Share2 size={14} />}
              {copied === 'list' ? 'Copied!' : 'Copy Name + Number'}
            </button>
            <button
              disabled={clients.length === 0}
              onClick={downloadCSV}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
            >
              <Download size={14} /> Download CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function whatsAppUrl(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('255')) return `https://wa.me/${d}`
  if (d.startsWith('0'))   return `https://wa.me/255${d.slice(1)}`
  return `https://wa.me/${d}`
}

function OverdueBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-gray-400">Never purchased</span>
  if (days < 7)      return null
  const label = `${days}d ago`
  if (days >= 15) return <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{label}</span>
  return <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{label}</span>
}

// ── Table columns ──────────────────────────────────────────────────────────
const BASE_COLUMNS = [
  {
    key: 'name',
    header: 'Name',
    render: (c: Client) => (
      <span className="flex items-center gap-1 flex-wrap">
        <span className="font-medium text-gray-900">{c.name}</span>
        <OverdueBadge days={c.days_since_purchase} />
      </span>
    ),
  },
  {
    key: 'phone',
    header: 'Phone',
    render: (c: Client) => c.phone
      ? <a href={whatsAppUrl(c.phone)} target="_blank" rel="noreferrer"
          className="text-primary-600 hover:underline" onClick={e => e.stopPropagation()}>
          {c.phone}
        </a>
      : '—',
  },
  {
    key: 'last_purchase',
    header: 'Last Purchase',
    render: (c: Client) => c.last_purchase_date
      ? <span className="text-xs text-gray-600">{new Date(c.last_purchase_date).toLocaleDateString()}</span>
      : <span className="text-xs text-gray-400">—</span>,
  },
  {
    key: 'last_products',
    header: 'Last Bought',
    render: (c: Client) => c.last_products
      ? <span className="text-xs text-gray-600 max-w-[180px] truncate block" title={c.last_products}>{c.last_products}</span>
      : <span className="text-xs text-gray-400">—</span>,
  },
  { key: 'location_name', header: 'Shop', render: (c: Client) => c.location_name ?? '—' },
  {
    key: 'is_active',
    header: 'Status',
    render: (c: Client) => (
      <Badge variant={c.is_active ? 'success' : 'danger'}>
        {c.is_active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
]

// ── Page ──────────────────────────────────────────────────────────────────
export default function ClientsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canWrite = user?.role === 'admin' || user?.role === 'seller'

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [followUp, setFollowUp] = useState(false)
  const [showCampaign, setShowCampaign] = useState(false)
  const [modalMode, setModalMode]     = useState<'create' | 'edit' | null>(null)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [pendingToggleId, setPendingToggleId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, search, followUp],
    queryFn: () => clientsApi.list(page, undefined, search || undefined, followUp || undefined).then(r => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      clientsApi.update(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setPendingToggleId(null)
    },
    onError: () => setPendingToggleId(null),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setConfirmDeleteId(null)
    },
    onError: () => setConfirmDeleteId(null),
  })

  const openCreate = () => { setEditingClient(null); setModalMode('create') }
  const openEdit   = useCallback((c: Client) => { setEditingClient(c); setModalMode('edit') }, [])
  const closeModal = () => { setModalMode(null); setEditingClient(null) }

  const columns = useMemo(() => [
    ...BASE_COLUMNS,
    ...(isAdmin ? [{
      key: 'actions',
      header: '',
      render: (c: Client) => (
        <div className="flex items-center gap-3">
          <button
            onClick={() => openEdit(c)}
            aria-label={`Edit ${c.name}`}
            className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={() => {
              setPendingToggleId(c.id)
              toggleMutation.mutate({ id: c.id, is_active: !c.is_active })
            }}
            disabled={pendingToggleId === c.id}
            aria-label={c.is_active ? `Deactivate ${c.name}` : `Activate ${c.name}`}
            className={`text-xs hover:underline disabled:opacity-50 ${c.is_active ? 'text-orange-500' : 'text-green-600'}`}
          >
            {pendingToggleId === c.id ? '…' : c.is_active ? 'Deactivate' : 'Activate'}
          </button>
          {confirmDeleteId === c.id ? (
            <span className="flex items-center gap-2">
              <button
                onClick={() => deleteMutation.mutate(c.id)}
                disabled={deleteMutation.isPending}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded disabled:opacity-50"
              >
                {deleteMutation.isPending ? '…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDeleteId(c.id)}
              aria-label={`Delete ${c.name}`}
              className="flex items-center gap-1 text-xs text-red-500 hover:underline"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      ),
    }] : []),
  ], [openEdit, pendingToggleId, toggleMutation.mutate, confirmDeleteId, deleteMutation.isPending])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search name or phone…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 pr-3 h-9 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
          </div>
          <button
            onClick={() => { setFollowUp(f => !f); setPage(1) }}
            className={`flex items-center gap-2 h-9 px-3 rounded-md border text-sm font-medium transition-colors ${
              followUp
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Bell size={14} /> Follow-Up Due
          </button>
          <button
            onClick={() => setShowCampaign(true)}
            className="flex items-center gap-2 h-9 px-3 rounded-md border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Share2 size={14} /> WhatsApp Campaign
          </button>
          {canWrite && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-9 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Plus size={16} /> Add Client
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="No clients found."
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

      {modalMode === 'edit' && editingClient && (
        <ClientFormModal mode="edit" client={editingClient} onClose={closeModal} isAdmin={isAdmin} />
      )}
      {modalMode === 'create' && (
        <ClientFormModal mode="create" onClose={closeModal} isAdmin={isAdmin} />
      )}
      {showCampaign && (
        <CampaignExportModal onClose={() => setShowCampaign(false)} isAdmin={isAdmin} />
      )}
    </div>
  )
}
