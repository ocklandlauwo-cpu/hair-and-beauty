import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import NewsPage from './NewsPage'

vi.mock('@/api/news', () => ({
  newsApi: {
    list: () => new Promise(() => {}),
    create: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
  },
}))

function renderNews() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>
          <NewsPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('NewsPage', () => {
  it('renders heading', () => {
    renderNews()
    expect(screen.getByRole('heading', { name: /news/i })).toBeInTheDocument()
  })
})
