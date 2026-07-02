import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { chartsApi, type LocationRow } from '@/api/charts'

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function monthStartStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function yearAgoStr() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  d.setDate(1)
  return d.toISOString().split('T')[0]
}

function fmtYAxis(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

function fmtTooltip(v: number) {
  return `TZS ${v.toLocaleString('en-US')}`
}

// Pivot flat rows [{date, location_name, total}] → [{date, LOC1: n, LOC2: n}]
function pivotByDate(rows: LocationRow[]) {
  const map = new Map<string, Record<string, number>>()
  for (const r of rows) {
    if (!map.has(r.date)) map.set(r.date, { date: r.date as unknown as number })
    map.get(r.date)![r.location_name] = Number(r.total)
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  )
}

const LINE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6']

// ── Date range controls ────────────────────────────────────────────────────
interface DateRangeProps {
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
}

function DateRange({ from, to, onFrom, onTo }: DateRangeProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500">From</label>
        <input
          type="date"
          value={from}
          max={to}
          onChange={e => onFrom(e.target.value)}
          className="h-8 rounded-md border border-gray-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500">To</label>
        <input
          type="date"
          value={to}
          min={from}
          max={todayStr()}
          onChange={e => onTo(e.target.value)}
          className="h-8 rounded-md border border-gray-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </div>
    </div>
  )
}

// ── Chart wrapper ──────────────────────────────────────────────────────────
function ChartCard({ title, children, isLoading, isEmpty }: {
  title: string
  children: React.ReactNode
  isLoading: boolean
  isEmpty: boolean
}) {
  return (
    <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">{title}</h2>
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">Loading…</div>
      ) : isEmpty ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">No data for selected range.</div>
      ) : (
        children
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function GraphicalViewPage() {
  // Shared date range for sales & profit
  const [salesFrom, setSalesFrom] = useState(monthStartStr())
  const [salesTo,   setSalesTo]   = useState(todayStr())

  // Separate range for purchases (default: past 12 months)
  const [purchFrom, setPurchFrom] = useState(yearAgoStr())
  const [purchTo,   setPurchTo]   = useState(todayStr())

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['charts-sales', salesFrom, salesTo],
    queryFn: () => chartsApi.salesByLocation(salesFrom, salesTo).then(r => r.data.data),
    staleTime: 60_000,
  })

  const { data: profitData, isLoading: profitLoading } = useQuery({
    queryKey: ['charts-profit', salesFrom, salesTo],
    queryFn: () => chartsApi.profitByLocation(salesFrom, salesTo).then(r => r.data.data),
    staleTime: 60_000,
  })

  const { data: purchData, isLoading: purchLoading } = useQuery({
    queryKey: ['charts-purchases', purchFrom, purchTo],
    queryFn: () => chartsApi.purchasesByMonth(purchFrom, purchTo).then(r => r.data.data),
    staleTime: 60_000,
  })

  // ── Pivot data ───────────────────────────────────────────────────────────
  const salesChartData  = useMemo(() => pivotByDate(salesData?.rows  ?? []), [salesData])
  const profitChartData = useMemo(() => pivotByDate(profitData?.rows ?? []), [profitData])

  const salesLocations  = salesData?.locations  ?? []
  const profitLocations = profitData?.locations ?? []

  const purchChartData = useMemo(() =>
    (purchData ?? []).map(r => ({
      month_label: r.month_label,
      total: Number(r.total),
      count: r.count,
    })),
    [purchData],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Graphical View</h1>
        <p className="mt-1 text-sm text-gray-500">Visual analytics across all shop locations</p>
      </div>

      {/* ── Sales & Profit section ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sales & Profit Date Range</span>
          <DateRange from={salesFrom} to={salesTo} onFrom={setSalesFrom} onTo={setSalesTo} />
        </div>

        {/* 1. Sales per location */}
        <ChartCard
          title="1. Sales per Location"
          isLoading={salesLoading}
          isEmpty={salesChartData.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesChartData} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={v => {
                  const d = new Date(String(v))
                  return `${d.getDate()}/${d.getMonth() + 1}`
                }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={fmtYAxis} width={56} />
              <Tooltip
                formatter={(v) => fmtTooltip(Number(v))}
                labelFormatter={l => `Date: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {salesLocations.map((loc, i) => (
                <Line
                  key={loc}
                  type="monotone"
                  dataKey={loc}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Profit per location */}
        <ChartCard
          title="2. Profit per Location"
          isLoading={profitLoading}
          isEmpty={profitChartData.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={profitChartData} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={v => {
                  const d = new Date(String(v))
                  return `${d.getDate()}/${d.getMonth() + 1}`
                }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={fmtYAxis} width={56} />
              <Tooltip
                formatter={(v) => fmtTooltip(Number(v))}
                labelFormatter={l => `Date: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {profitLocations.map((loc, i) => (
                <Line
                  key={loc}
                  type="monotone"
                  dataKey={loc}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Purchases section ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Purchases Date Range</span>
          <DateRange from={purchFrom} to={purchTo} onFrom={setPurchFrom} onTo={setPurchTo} />
        </div>

        {/* 3. Purchases by month */}
        <ChartCard
          title="3. Purchases vs Month"
          isLoading={purchLoading}
          isEmpty={purchChartData.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={purchChartData} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month_label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={fmtYAxis} width={56} />
              <Tooltip
                formatter={(v, name) =>
                  name === 'total'
                    ? [fmtTooltip(Number(v)), 'Total']
                    : [v, 'Purchases']
                }
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="total"
                name="Total Amount (TZS)"
                stroke={LINE_COLORS[0]}
                strokeWidth={2.5}
                dot={{ r: 4, fill: LINE_COLORS[0] }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
