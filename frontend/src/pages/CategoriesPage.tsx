import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { Pencil, Plus, X } from 'lucide-react'
import { categoriesApi, type Category } from '@/api/categories'
import DataTable from '@/components/ui/DataTable'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
})
type FormValues = z.infer<typeof schema>

// ── Modal ──────────────────────────────────────────────────────────────────
type ModalProps =
  | { mode: 'create'; category?: never; onClose: () => void }
  | { mode: 'edit';   category: Category; onClose: () => void }

function CategoryModal({ mode, category, onClose }: ModalProps) {
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: mode === 'edit' ? category.name : '' },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      mode === 'create'
        ? categoriesApi.create(values)
        : categoriesApi.update(category.id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'create' ? 'Add Category' : 'Edit Category'}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit(values => { setServerError(null); mutation.mutate(values) })}
          className="space-y-4"
        >
          <div>
            <label htmlFor="cat-name" className="block text-sm font-medium text-gray-700">Name</label>
            <input
              id="cat-name"
              type="text"
              {...register('name')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          {serverError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-10 px-4 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="h-10 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving…' : mode === 'create' ? 'Add Category' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
const columns = [
  { key: 'id',   header: 'ID' },
  { key: 'name', header: 'Category Name' },
]

export default function CategoriesPage() {
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Category | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then(r => r.data.data),
  })

  const openCreate = () => { setEditing(null); setModalMode('create') }
  const openEdit   = (c: Category) => { setEditing(c); setModalMode('edit') }
  const closeModal = () => { setModalMode(null); setEditing(null) }

  const columnsWithActions = [
    ...columns,
    {
      key: 'actions',
      header: '',
      render: (c: Category) => (
        <button
          onClick={() => openEdit(c)}
          aria-label={`Edit ${c.name}`}
          className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
        >
          <Pencil size={12} /> Edit
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Categories</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-9 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Plus size={16} /> Add Category
        </button>
      </div>

      <DataTable
        columns={columnsWithActions}
        data={data ?? []}
        isLoading={isLoading}
        emptyMessage="No categories found."
      />

      {modalMode === 'create' && (
        <CategoryModal mode="create" onClose={closeModal} />
      )}
      {modalMode === 'edit' && editing && (
        <CategoryModal mode="edit" category={editing} onClose={closeModal} />
      )}
    </div>
  )
}
