import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProvidersPage from './ProvidersPage'
import { providersApi } from '@/api/providers'

vi.mock('@/api/providers', () => ({
  providersApi: {
    list: vi.fn(() => new Promise(() => {})),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ProvidersPage /></QueryClientProvider>)
}

describe('ProvidersPage', () => {
  it('renders heading and Add Provider button', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /providers/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add provider/i })).toBeInTheDocument()
  })

  it('lists providers returned by the API', async () => {
    vi.mocked(providersApi.list).mockResolvedValueOnce({
      data: { data: [{ id: 1, name: 'Jane Doe', phone: '0712345678', is_active: true }] },
    } as never)

    renderPage()
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('0712345678')).toBeInTheDocument()
  })

  it('opens the add-provider modal and submits a new provider', async () => {
    vi.mocked(providersApi.list).mockResolvedValue({ data: { data: [] } } as never)
    vi.mocked(providersApi.create).mockResolvedValueOnce({
      data: { data: { id: 2, name: 'New Provider', phone: null, is_active: true } },
    } as never)

    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /add provider/i }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'New Provider')
    await user.click(within(dialog).getByRole('button', { name: /^add provider$/i }))

    expect(providersApi.create).toHaveBeenCalledWith({ name: 'New Provider', phone: null })
  })
})
