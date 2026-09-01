import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import DashboardPage from './DashboardPage'
import { dashboardApi } from '@/api/dashboard'

// Prevent real API calls — queries will stay in fetching state (isLoading: true) unless a test resolves them
vi.mock('@/api/dashboard', () => ({
  dashboardApi: { get: vi.fn(() => new Promise(() => {})) },
}))
vi.mock('@/api/news', () => ({
  newsApi: { list: () => new Promise(() => {}) },
}))

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  it('renders loading state initially', () => {
    renderDashboard()
    expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument()
  })
})

const adminDashboardWithSaloon = {
  role: 'admin',
  sales: { today: '100000.00', today_by_shop: [], this_month: '2000000.00', this_month_by_shop: [] },
  expenses: { this_month: '50000.00', this_month_by_shop: [] },
  profit: { today: '30000.00', today_by_shop: [], this_month: '600000.00', this_month_by_shop: [] },
  asset_value: { total: '1000000.00', by_shop: [] },
  store_asset_value: { total: '500000.00', by_location: [] },
  saloon: {
    sales: { today: '10000.00', today_by_shop: [], this_month: '250000.00', this_month_by_shop: [] },
    profit: { today: '7500.00', today_by_shop: [], this_month: '187500.00', this_month_by_shop: [] },
    expenses: { this_month: '4000.00', this_month_by_shop: [] },
    asset_value: { total: '150000.00', by_shop: [] },
  },
  distributions: { pending: 0 },
  stock: { expiry_alerts: 0, low_stock_alerts: 0 },
  users: { active: 1 },
}

describe('DashboardPage Saloon Center section', () => {
  it('renders a Saloon Center heading and its six cards', async () => {
    vi.mocked(dashboardApi.get).mockResolvedValueOnce({ data: { data: adminDashboardWithSaloon } } as never)

    renderDashboard()

    expect(await screen.findByText(/saloon center/i)).toBeInTheDocument()
    expect(screen.getAllByText(/sales today/i).length).toBeGreaterThan(0)
    expect(screen.getByText('TZS 10,000')).toBeInTheDocument() // saloon sales today
    expect(screen.getByText('TZS 7,500')).toBeInTheDocument()  // saloon profit today (75%)
  })
})
