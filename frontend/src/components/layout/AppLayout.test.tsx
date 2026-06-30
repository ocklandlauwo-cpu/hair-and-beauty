import { it, vi, expect, describe } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import AppLayout from './AppLayout'

// Prevent the real idle timer from running in tests
vi.mock('@/hooks/useIdleTimer', () => ({
  useIdleTimer: vi.fn().mockReturnValue({ reset: vi.fn() }),
}))

function makeRouter() {
  return createMemoryRouter(
    [{ path: '/', element: <AppLayout />, children: [{ index: true, element: <div>content</div> }] }],
    { initialEntries: ['/'] },
  )
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <RouterProvider router={makeRouter()} />
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('AppLayout', () => {
  it('renders sidebar and main content area', () => {
    setup()
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByText('Hair & Beauty')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('does not show session warning on initial render', () => {
    setup()
    expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument()
  })
})
