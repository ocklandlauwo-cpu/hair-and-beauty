import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SaloonServicesPage from './SaloonServicesPage'
import { saloonServicesApi } from '@/api/saloonServices'

vi.mock('@/api/saloonServices', () => ({
  saloonServicesApi: {
    list: vi.fn(() => new Promise(() => {})),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><SaloonServicesPage /></QueryClientProvider>)
}

describe('SaloonServicesPage', () => {
  it('renders heading and lists services', async () => {
    vi.mocked(saloonServicesApi.list).mockResolvedValueOnce({
      data: { data: [{ id: 1, name: 'Kuosha', is_active: true }] },
    } as never)

    renderPage()
    expect(screen.getByRole('heading', { name: /saloon services/i })).toBeInTheDocument()
    expect(await screen.findByText('Kuosha')).toBeInTheDocument()
  })
})
