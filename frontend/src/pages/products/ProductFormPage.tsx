import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productsApi, type ProductPayload } from '@/api/products'
import { categoriesApi } from '@/api/categories'

export default function ProductFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('')
  const [wholesaleThreshold, setWholesaleThreshold] = useState('12')
  const [wholesalePrice, setWholesalePrice] = useState('')
  const [retailPrice, setRetailPrice] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then(r => r.data.data),
  })

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: isEdit ? ['products', Number(id)] : ['products-new'],
    queryFn: () => productsApi.show(Number(id!)).then(r => r.data.data),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) {
      setCategoryId(existing.category_id)
      setName(existing.name)
      setSku(existing.sku ?? '')
      setUnit(existing.unit ?? '')
      setWholesaleThreshold(String(existing.wholesale_threshold))
      setWholesalePrice(existing.wholesale_price)
      setRetailPrice(existing.retail_price)
      setIsActive(existing.is_active)
    }
  }, [existing])

  const mutation = useMutation({
    mutationFn: (data: ProductPayload) =>
      isEdit ? productsApi.update(Number(id!), data) : productsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      navigate('/products')
    },
    onError: () => setError('Failed to save product. Check all fields.'),
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!categoryId) { setError('Select a category.'); return }
    const wholesale = Number(wholesalePrice)
    const retail = Number(retailPrice)
    if (isNaN(wholesale) || wholesale < 0) { setError('Enter a valid wholesale price.'); return }
    if (isNaN(retail) || retail < wholesale) { setError('Retail price must be ≥ wholesale price.'); return }
    setError(null)
    mutation.mutate({
      category_id: Number(categoryId),
      name,
      sku: sku || undefined,
      unit: unit || undefined,
      wholesale_threshold: Number(wholesaleThreshold) || 12,
      wholesale_price: wholesale,
      retail_price: retail,
      is_active: isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">
        {isEdit ? 'Edit Product' : 'New Product'}
      </h1>

      {isEdit && loadingExisting && (
        <div className="text-sm text-gray-500">Loading…</div>
      )}

      <div>
        <label htmlFor="pf-category" className="block text-sm font-medium text-gray-700">Category</label>
        <select
          id="pf-category"
          value={categoryId}
          onChange={e => setCategoryId(Number(e.target.value))}
          required
          className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        >
          <option value="">Select category…</option>
          {(categories ?? []).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="pf-name" className="block text-sm font-medium text-gray-700">Name</label>
        <input
          id="pf-name"
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="pf-sku" className="block text-sm font-medium text-gray-700">SKU (optional)</label>
          <input
            id="pf-sku"
            type="text"
            value={sku}
            onChange={e => setSku(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="pf-unit" className="block text-sm font-medium text-gray-700">Unit (optional)</label>
          <input
            id="pf-unit"
            type="text"
            placeholder="e.g. pcs, bottle"
            value={unit}
            onChange={e => setUnit(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="pf-wholesale" className="block text-sm font-medium text-gray-700">
            Wholesale Price (TZS)
          </label>
          <input
            id="pf-wholesale"
            type="number"
            min="0"
            required
            value={wholesalePrice}
            onChange={e => setWholesalePrice(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="pf-retail" className="block text-sm font-medium text-gray-700">
            Retail Price (TZS)
          </label>
          <input
            id="pf-retail"
            type="number"
            min="0"
            required
            value={retailPrice}
            onChange={e => setRetailPrice(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="pf-threshold" className="block text-sm font-medium text-gray-700">
            Wholesale qty threshold
          </label>
          <input
            id="pf-threshold"
            type="number"
            min="1"
            value={wholesaleThreshold}
            onChange={e => setWholesaleThreshold(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="pf-active"
          type="checkbox"
          checked={isActive}
          onChange={e => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
        />
        <label htmlFor="pf-active" className="text-sm font-medium text-gray-700">Active</label>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => navigate('/products')}
          className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-primary-600 px-6 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Product'}
        </button>
      </div>
    </form>
  )
}
