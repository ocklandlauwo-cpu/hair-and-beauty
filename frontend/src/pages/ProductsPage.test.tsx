import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import ProductsPage from './ProductsPage'

// Prevent real API calls — queries will stay in fetching state (isLoading: true)
vi.mock('@/api/products', () => ({
  productsApi: { list: () => new Promise(() => {}) },
}))

function renderProductsPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>
          <ProductsPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('ProductsPage', () => {
  it('renders heading and search input', () => {
    renderProductsPage()
    expect(screen.getByRole('heading', { name: /products/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search products/i)).toBeInTheDocument()
  })

  it('shows loading state when query is in flight', () => {
    renderProductsPage()
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0)
  })
})
