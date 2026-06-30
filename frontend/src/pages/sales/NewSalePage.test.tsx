import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import NewSalePage from './NewSalePage'
import { AuthProvider } from '@/contexts/AuthContext'

vi.mock('@/api/products', () => ({
  productsApi: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}))
vi.mock('@/api/clients', () => ({
  clientsApi: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}))

describe('NewSalePage', () => {
  const setup = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
    return render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <NewSalePage />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>
    )
  }

  it('renders heading and client selector', () => {
    setup()
    expect(screen.getByRole('heading', { name: /new sale/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/client/i)).toBeInTheDocument()
  })
})
