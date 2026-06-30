import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle } from 'lucide-react'
import { reconciliationsApi, type Reconciliation } from '@/api/reconciliations'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

const today = new Date().toISOString().split('T')[0]

export default function ReconciliationPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['reconciliations'],
    queryFn: () => reconciliationsApi.list().then(r => r.data),
  })

  const alreadySubmittedToday = data?.data.some(r => r.reconciliation_date === today) ?? false

  const submitMutation = useMutation({
    mutationFn: reconciliationsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliations'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setAmount('')
      setNotes('')
      setError(null)
      setSuccess(true)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to submit reconciliation.')
      setSuccess(false)
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (id: number) => reconciliationsApi.verify(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliations'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to verify reconciliation.')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsedAmount = Number(amount)
    if (!amount || isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Enter a valid total amount (≥ 0).')
      return
    }
    setError(null)
    submitMutation.mutate({ reconciliation_date: today, total_sold_amount: parsedAmount, notes: notes || undefined })
  }

  const columns = [
    { key: 'reconciliation_date', header: 'Date' },
    {
      key: 'total_sold_amount',
      header: 'Total Sold (TZS)',
      render: (r: Reconciliation) => Number(r.total_sold_amount).toLocaleString('en-US'),
    },
    { key: 'notes', header: 'Notes', render: (r: Reconciliation) => r.notes ?? '—' },
    {
      key: 'verified_by',
      header: 'Status',
      render: (r: Reconciliation) =>
        r.verified_by
          ? <Badge variant="success">Verified</Badge>
          : <Badge variant="warning">Pending verification</Badge>,
    },
    ...(isAdmin ? [{
      key: 'verify_action',
      header: '',
      render: (r: Reconciliation) => !r.verified_by ? (
        <button
          onClick={() => verifyMutation.mutate(r.id)}
          disabled={verifyMutation.isPending && verifyMutation.variables === r.id}
          className="text-xs text-primary-600 hover:underline disabled:opacity-50"
          aria-label={`Verify reconciliation for ${r.reconciliation_date}`}
        >
          Verify
        </button>
      ) : null,
    }] : []),
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Daily Reconciliation</h1>

      {/* Submit form */}
      {!alreadySubmittedToday ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 max-w-md">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Submit for {today}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="recon-amount" className="block text-sm font-medium text-gray-700">
                Total Sold Today (TZS)
              </label>
              <input
                id="recon-amount"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 350000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
            <div>
              <label htmlFor="recon-notes" className="block text-sm font-medium text-gray-700">
                Notes (optional)
              </label>
              <textarea
                id="recon-notes"
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {success && (
              <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                <CheckCircle size={14} /> Reconciliation submitted successfully.
              </p>
            )}
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="w-full rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {submitMutation.isPending ? 'Submitting…' : 'Submit Reconciliation'}
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 max-w-md">
          <CheckCircle size={18} className="text-green-600" />
          <p className="text-sm text-green-800 font-medium">Today's reconciliation has been submitted.</p>
        </div>
      )}

      {/* History */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Reconciliation History</h2>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          emptyMessage="No reconciliations yet."
        />
      </div>
    </div>
  )
}
