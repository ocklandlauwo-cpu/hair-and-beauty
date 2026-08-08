import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import ProductsPage from './ProductsPage'
import { productsApi } from '@/api/products'

// Prevent real API calls — default resolves to an unresolved promise (isLoading: true)
// unless a test overrides it via productsApi.list.mockResolvedValueOnce(...).
vi.mock('@/api/products', () => ({
  productsApi: { list: vi.fn(() => new Promise(() => {})) },
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

  it('shows latest purchase cost, with a dash for products never purchased', async () => {
    vi.mocked(productsApi.list).mockResolvedValueOnce({
      data: {
        data: [
          { id: 1, category_id: 1, category_name: 'Hair Care', name: 'Never Purchased Product', sku: null, unit: 'piece', wholesale_threshold: 12, wholesale_price: '5000.00', retail_price: '8000.00', latest_cost: '0.00', is_active: true },
          { id: 2, category_id: 1, category_name: 'Hair Care', name: 'Purchased Product', sku: null, unit: 'piece', wholesale_threshold: 12, wholesale_price: '4000.00', retail_price: '7000.00', latest_cost: '3200.00', is_active: true },
        ],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 2 },
      },
    } as never)

    renderProductsPage()

    expect(await screen.findByText('Latest Purchase Cost (TZS)')).toBeInTheDocument()

    const purchasedRow = (await screen.findByText('Purchased Product')).closest('tr')
    expect(purchasedRow).not.toBeNull()
    expect(purchasedRow!.textContent).toContain('3,200')

    const neverPurchasedRow = screen.getByText('Never Purchased Product').closest('tr')
    expect(neverPurchasedRow).not.toBeNull()
    expect(neverPurchasedRow!.textContent).toContain('—')
  })
})
