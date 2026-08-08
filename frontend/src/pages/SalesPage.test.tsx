import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import SalesPage from './SalesPage'

vi.mock('@/api/sales', () => ({
  salesApi: {
    list: () => new Promise(() => {}),
    create: vi.fn(),
    revert: vi.fn(),
    analysis: vi.fn(() => Promise.resolve({
      data: {
        data: [
          { product_id: 1, product_name: 'Analysis Product Alpha', quantity_sold: 7, shop: 'All Shops' },
          { product_id: 2, product_name: 'Analysis Product Beta', quantity_sold: 3, shop: 'All Shops' },
        ],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 2 },
      },
    })),
  },
}))

function renderSales() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>
          <SalesPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('SalesPage', () => {
  it('renders heading', () => {
    renderSales()
    expect(screen.getByRole('heading', { name: /sales/i })).toBeInTheDocument()
  })

  it('shows New Sale button for default auth user', () => {
    renderSales()
    // AuthProvider defaults to no user → button absent (guard: seller || admin)
    expect(screen.queryByRole('link', { name: /new sale/i })).not.toBeInTheDocument()
  })

  it('switches to Sales Analysis tab and shows product rows', async () => {
    renderSales()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /sales analysis/i }))

    expect(await screen.findByText('Analysis Product Alpha')).toBeInTheDocument()
    expect(screen.getByText('Analysis Product Beta')).toBeInTheDocument()
  })
})
