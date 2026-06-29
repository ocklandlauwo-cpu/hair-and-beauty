import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { pnlApi } from '@/api/expenses'
import { reportsApi, triggerBlobDownload } from '@/api/reports'

const thisMonth = new Date()
const defaultFrom = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}-01`
const defaultTo = new Date().toISOString().split('T')[0]

function formatTzs(value: string) {
  return `TZS ${Number(value).toLocaleString('en-US')}`
}

export default function PnlPage() {
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      const res = await reportsApi.downloadMonthly()
      triggerBlobDownload(
        new Blob([res.data as BlobPart], { type: 'application/pdf' }),
        `monthly-report-${from}-${to}.pdf`,
      )
    } catch {
      setDownloadError('Download failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pnl', from, to],
    queryFn: () => pnlApi.get({ from, to }).then(r => r.data.data),
    enabled: false,
  })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">P&L Report</h1>

      {/* Date filter */}
      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="pnl-from" className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input id="pnl-from" type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="pnl-to" className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input id="pnl-to" type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {isLoading ? 'Loading…' : 'Generate Report'}
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 rounded-md border border-gray-200 px-4 h-10 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={14} />
          {downloading ? 'Downloading…' : 'Download Monthly PDF'}
        </button>
        {downloadError && (
          <p className="text-sm text-red-600">{downloadError}</p>
        )}
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[
              { label: 'Revenue', value: data.revenue, color: 'text-gray-900' },
              { label: 'Cost of Goods Sold', value: data.cost_of_goods_sold, color: 'text-gray-500' },
              { label: 'Gross Profit', value: data.gross_profit, color: 'text-blue-700' },
              { label: 'Total Expenses', value: data.expenses, color: 'text-red-600' },
              { label: 'Net Profit', value: data.net_profit, color: Number(data.net_profit) >= 0 ? 'text-green-700' : 'text-red-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border border-gray-200 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
                <p className={`mt-2 text-2xl font-semibold ${color}`}>{formatTzs(value)}</p>
              </div>
            ))}
          </div>

          {data.expense_breakdown.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-700">Expense Breakdown</h3>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {data.expense_breakdown.map(row => (
                    <tr key={row.category}>
                      <td className="px-4 py-3 capitalize text-gray-700">{row.category}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatTzs(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!data && !isLoading && (
        <p className="text-sm text-gray-400">Select a date range and click Generate Report.</p>
      )}
    </div>
  )
}
