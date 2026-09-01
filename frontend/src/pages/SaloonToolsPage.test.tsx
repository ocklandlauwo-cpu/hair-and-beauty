import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SaloonToolsPage from './SaloonToolsPage'
import { saloonToolsApi } from '@/api/saloonTools'
import { locationsApi } from '@/api/locations'

vi.mock('@/api/saloonTools', () => ({
  saloonToolsApi: {
    list: vi.fn(() => Promise.resolve({
      data: {
        data: [{ id: 1, purchase_date: '2026-08-31', location_name: 'Shop A', name: 'Hair Dryer', quantity: 3, unit_cost: '50000.00', total: 150000 }],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 1 },
      },
    })),
    create: vi.fn(),
  },
}))
vi.mock('@/api/locations', () => ({
  locationsApi: { list: vi.fn(() => Promise.resolve({ data: { data: [{ id: 1, name: 'Shop A', type: 'shop', is_active: true }] } })) },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><SaloonToolsPage /></QueryClientProvider>)
}

describe('SaloonToolsPage', () => {
  it('renders heading and lists logged tool purchases', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /saloon tools/i })).toBeInTheDocument()
    expect(await screen.findByText('Hair Dryer')).toBeInTheDocument()
  })

  it('submits a new tool purchase', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.selectOptions(await screen.findByLabelText(/shop/i), '1')
    await user.type(screen.getByLabelText(/item name/i), 'Clipper')
    await user.clear(screen.getByLabelText(/quantity/i))
    await user.type(screen.getByLabelText(/quantity/i), '2')
    await user.type(screen.getByLabelText(/unit cost/i), '25000')
    await user.click(screen.getByRole('button', { name: /add purchase/i }))

    expect(saloonToolsApi.create).toHaveBeenCalledWith(expect.objectContaining({
      location_id: 1, name: 'Clipper', quantity: 2, unit_cost: 25000,
    }))
  })
})
