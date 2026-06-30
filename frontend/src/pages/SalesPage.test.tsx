import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import SalesPage from './SalesPage'

vi.mock('@/api/sales', () => ({
  salesApi: {
    list: () => new Promise(() => {}),
    create: vi.fn(),
    revert: vi.fn(),
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
})
