import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { aiReportsApi, type TopClientsPeriod } from '@/api/aiReports'

const PERIODS: { value: TopClientsPeriod; label: string }[] = [
  { value: 'all',   label: 'All Time' },
  { value: '30d',   label: 'Last 30 Days' },
  { value: '90d',   label: 'Last 90 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'year',  label: 'This Year' },
]

function whatsAppUrl(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('255') ? digits : '255' + digits.replace(/^0/, '')
  return `https://wa.me/${normalized}`
}

function fmtTzs(value: string | number) {
  return Number(value).toLocaleString('en-US')
}

const MEDAL: Record<number, { emoji: string; bg: string; text: string }> = {
  1: { emoji: '🥇', bg: 'bg-yellow-50',  text: 'text-yellow-700' },
  2: { emoji: '🥈', bg: 'bg-gray-100',   text: 'text-gray-600'   },
  3: { emoji: '🥉', bg: 'bg-orange-50',  text: 'text-orange-600' },
}

export default function TopClientsPage() {
  const [period, setPeriod] = useState<TopClientsPeriod>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['ai-reports', 'top-clients', period],
    queryFn: () => aiReportsApi.topClients(period).then(r => r.data.data),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Top Client Leaderboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Clients ranked by total spend (after discounts). Top 50 shown.
          </p>
        </div>

        {/* Period filter */}
        <select
          value={period}
          onChange={e => setPeriod(e.target.value as TopClientsPeriod)}
          className="rounded-lg border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600 bg-white"
        >
          {PERIODS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <p className="text-sm text-gray-400">Loading…</p>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">No sales with linked clients found for this period.</p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
                  <th className="px-4 py-3 text-center font-medium w-12">#</th>
                  <th className="px-4 py-3 text-left font-medium">Client</th>
                  <th className="px-4 py-3 text-left font-medium">Shop</th>
                  <th className="px-4 py-3 text-right font-medium">Total Spend (TZS)</th>
                  <th className="px-4 py-3 text-right font-medium">Purchases</th>
                  <th className="px-4 py-3 text-right font-medium">Avg Order (TZS)</th>
                  <th className="px-4 py-3 text-right font-medium">Last Purchase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.map((client, index) => {
                  const rank = index + 1
                  const medal = MEDAL[rank]
                  const waUrl = whatsAppUrl(client.phone)

                  return (
                    <tr key={client.client_id} className={`hover:bg-gray-50 transition-colors ${medal ? medal.bg : ''}`}>
                      {/* Rank */}
                      <td className="px-4 py-3 text-center">
                        {medal
                          ? <span className="text-lg">{medal.emoji}</span>
                          : <span className="text-xs font-semibold text-gray-400">{rank}</span>
                        }
                      </td>

                      {/* Client name + phone */}
                      <td className="px-4 py-3">
                        <p className={`font-semibold ${medal ? medal.text : 'text-gray-800'}`}>
                          {client.client_name}
                        </p>
                        {client.phone && (
                          waUrl
                            ? <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-green-600 hover:underline"
                              >
                                {client.phone}
                              </a>
                            : <span className="text-xs text-gray-400">{client.phone}</span>
                        )}
                      </td>

                      {/* Shop */}
                      <td className="px-4 py-3 text-gray-500 text-xs">{client.location_name ?? '—'}</td>

                      {/* Total spend */}
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {fmtTzs(client.total_spend)}
                      </td>

                      {/* Purchase count */}
                      <td className="px-4 py-3 text-right text-gray-600">{client.total_purchases}</td>

                      {/* Avg order */}
                      <td className="px-4 py-3 text-right text-gray-500">
                        {fmtTzs(client.avg_order_value)}
                      </td>

                      {/* Last purchase */}
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">
                        {client.last_purchase_date}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
