import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { Pencil, Plus, X, Trash2 } from 'lucide-react'
import { saloonServicesApi, type SaloonService } from '@/api/saloonServices'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
})
type FormValues = z.infer<typeof schema>

type ModalProps =
  | { mode: 'create'; service?: never; onClose: () => void }
  | { mode: 'edit';   service: SaloonService; onClose: () => void }

function SaloonServiceModal({ mode, service, onClose }: ModalProps) {
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: mode === 'edit' ? service.name : '' },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      mode === 'create' ? saloonServicesApi.create(values) : saloonServicesApi.update(service.id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saloon-services'] })
      onClose()
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
      const data = (err as ApiErr)?.response?.data
      const fieldErrors = data?.errors
      const firstField = fieldErrors ? Object.values(fieldErrors)[0]?.[0] : undefined
      setServerError(firstField ?? data?.message ?? 'An error occurred.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'create' ? 'Add Saloon Service' : 'Edit Saloon Service'}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(values => { setServerError(null); mutation.mutate(values) })} className="space-y-4">
          <div>
            <label htmlFor="ss-name" className="block text-sm font-medium text-gray-700">Name</label>
            <input id="ss-name" type="text" {...register('name')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          {serverError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-10 px-4 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="h-10 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : mode === 'create' ? 'Add Service' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SaloonServicesPage() {
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<SaloonService | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['saloon-services'],
    queryFn: () => saloonServicesApi.list().then(r => r.data.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => saloonServicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saloon-services'] })
      setConfirmDeleteId(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      setDeleteError((err as ApiErr)?.response?.data?.message ?? 'Delete failed. Please try again.')
    },
  })

  const openCreate = () => { setEditing(null); setModalMode('create') }
  const openEdit   = (s: SaloonService) => { setEditing(s); setModalMode('edit') }
  const closeModal = () => { setModalMode(null); setEditing(null) }

  const columns = [
    { key: 'name', header: 'Service Name' },
    {
      key: 'is_active',
      header: 'Status',
      render: (s: SaloonService) => <Badge variant={s.is_active ? 'success' : 'default'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (s: SaloonService) => (
        <div className="flex items-center gap-3">
          <button onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}
            className="flex items-center gap-1 text-xs text-primary-600 hover:underline">
            <Pencil size={12} /> Edit
          </button>
          {confirmDeleteId === s.id ? (
            <span className="flex items-center gap-2">
              <button onClick={() => deleteMutation.mutate(s.id)} disabled={deleteMutation.isPending}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded disabled:opacity-50">
                {deleteMutation.isPending ? '…' : 'Confirm'}
              </button>
              <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => { setConfirmDeleteId(s.id); setDeleteError(null) }} aria-label={`Delete ${s.name}`}
              className="flex items-center gap-1 text-xs text-red-500 hover:underline">
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Saloon Services</h1>
        <button onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-9 text-sm font-medium text-white hover:bg-primary-700">
          <Plus size={16} /> Add Service
        </button>
      </div>

      {deleteError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}

      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} emptyMessage="No saloon services found." />

      {modalMode === 'create' && <SaloonServiceModal mode="create" onClose={closeModal} />}
      {modalMode === 'edit' && editing && <SaloonServiceModal mode="edit" service={editing} onClose={closeModal} />}
    </div>
  )
}
