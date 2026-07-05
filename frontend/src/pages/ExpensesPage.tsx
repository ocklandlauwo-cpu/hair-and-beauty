import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { expensesApi, EXPENSE_CATEGORIES, type Expense } from '@/api/expenses'
import { locationsApi } from '@/api/locations'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'

const columns = [
  { key: 'expense_date', header: 'Date' },
  { key: 'location_name', header: 'Shop', render: (e: Expense) => e.location_name ?? '—' },
  { key: 'category', header: 'Category', render: (e: Expense) => <span className="capitalize">{e.category}</span> },
  { key: 'amount', header: 'Amount (TZS)', render: (e: Expense) => Number(e.amount).toLocaleString('en-US') },
  { key: 'notes', header: 'Notes', render: (e: Expense) => e.notes ?? '—' },
]

export default function ExpensesPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [locationId, setLocationId] = useState<number | ''>('')
  const [category, setCategory] = useState<typeof EXPENSE_CATEGORIES[number]>('rent')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => expensesApi.list().then(r => r.data),
  })

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
    enabled: isAdmin,
  })

  const mutation = useMutation({
    mutationFn: expensesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setAmount('')
      setNotes('')
      setLocationId('')
      setError(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (err: unknown) => { setError(err instanceof Error ? err.message : 'Failed to record expense.'); setSuccess(false) },
  })

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    const parsedAmount = Number(amount)
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount greater than 0.')
      return
    }
    if (isAdmin && !locationId) {
      setError('Select a shop for this expense.')
      return
    }
    setError(null)
    mutation.mutate({
      category,
      amount: parsedAmount,
      expense_date: date,
      notes: notes || undefined,
      location_id: isAdmin && locationId ? Number(locationId) : undefined,
    })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>

      {/* Record expense form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 max-w-lg">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Record Expense</h2>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Shop selector — admin only */}
          {isAdmin && (
            <div>
              <label htmlFor="exp-location" className="block text-sm font-medium text-gray-700">
                Shop <span className="text-red-500">*</span>
              </label>
              <select
                id="exp-location"
                value={locationId}
                onChange={e => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              >
                <option value="">— Select shop —</option>
                {(locationsData ?? []).filter(l => l.is_active).map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="exp-category" className="block text-sm font-medium text-gray-700">Category</label>
              <select
                id="exp-category"
                value={category}
                onChange={e => setCategory(e.target.value as typeof category)}
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm capitalize focus:outline-none focus:ring-1 focus:ring-primary-600"
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="exp-date" className="block text-sm font-medium text-gray-700">Date</label>
              <input
                id="exp-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="exp-amount" className="block text-sm font-medium text-gray-700">Amount (TZS)</label>
            <input
              id="exp-amount"
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 500000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
          </div>

          <div>
            <label htmlFor="exp-notes" className="block text-sm font-medium text-gray-700">Notes (optional)</label>
            <input
              id="exp-notes"
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Expense recorded.</p>}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Recording…' : 'Record Expense'}
          </button>
        </form>
      </div>

      {/* Expenses list */}
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No expenses recorded." />
    </div>
  )
}
