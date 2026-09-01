import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import SaloonCenterPage from './SaloonCenterPage'
import type { User } from '@/types'

// AuthProvider defaults to unauthenticated (no "Log Sale" button would render) unless
// localStorage already has a user — matches the pattern in AuthContext.test.tsx.
const sellerUser: User = { id: 1, name: 'Seller One', email: 'seller@test.com', role: 'seller', location_id: 1, is_active: true, created_at: '', updated_at: '' }

beforeEach(() => {
  localStorage.setItem('auth_user', JSON.stringify(sellerUser))
})

vi.mock('@/api/saloonSales', () => ({
  saloonSalesApi: {
    list: vi.fn(() => Promise.resolve({
      data: {
        data: [{ id: 1, sale_date: '2026-08-31', provider_name: 'Jane', service_name: 'Kuosha', amount: '5000.00', location_name: 'Shop A' }],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 1 },
      },
    })),
    create: vi.fn(),
  },
}))
vi.mock('@/api/providers', () => ({
  providersApi: { list: vi.fn(() => Promise.resolve({ data: { data: [{ id: 1, name: 'Jane', phone: null, is_active: true }] } })) },
}))
vi.mock('@/api/saloonServices', () => ({
  saloonServicesApi: { list: vi.fn(() => Promise.resolve({ data: { data: [{ id: 1, name: 'Kuosha', is_active: true }] } })) },
}))
vi.mock('@/api/locations', () => ({
  locationsApi: { list: vi.fn(() => Promise.resolve({ data: { data: [{ id: 1, name: 'Shop A', type: 'shop', is_active: true }] } })) },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <SaloonCenterPage />
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('SaloonCenterPage', () => {
  it('renders heading and the list of logged services', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /saloon center/i })).toBeInTheDocument()
    expect(await screen.findByText('Jane')).toBeInTheDocument()
    expect(screen.getByText('Kuosha')).toBeInTheDocument()
  })

  it('opens the Log Sale modal', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /log sale/i }))
    expect(screen.getByRole('heading', { name: /log saloon sale/i })).toBeInTheDocument()
  })
})
