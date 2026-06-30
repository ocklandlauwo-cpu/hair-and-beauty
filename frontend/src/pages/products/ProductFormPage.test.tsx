import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProductFormPage from './ProductFormPage'

vi.mock('@/api/categories', () => ({
  categoriesApi: { list: () => new Promise(() => {}) },
}))
vi.mock('@/api/products', () => ({
  productsApi: {
    list: () => new Promise(() => {}),
    show: () => new Promise(() => {}),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

function renderForm(path = '/products/new') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/products/new" element={<ProductFormPage />} />
          <Route path="/products/:id/edit" element={<ProductFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ProductFormPage', () => {
  it('shows "New Product" heading in create mode', () => {
    renderForm('/products/new')
    expect(screen.getByRole('heading', { name: /new product/i })).toBeInTheDocument()
  })

  it('shows "Edit Product" heading in edit mode', () => {
    renderForm('/products/42/edit')
    expect(screen.getByRole('heading', { name: /edit product/i })).toBeInTheDocument()
  })
})
