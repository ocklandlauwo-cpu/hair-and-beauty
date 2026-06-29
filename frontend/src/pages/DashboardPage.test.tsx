import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import DashboardPage from './DashboardPage'

// Prevent real API calls — queries will stay in fetching state (isLoading: true)
vi.mock('@/api/dashboard', () => ({
  dashboardApi: { get: () => new Promise(() => {}) },
}))
vi.mock('@/api/news', () => ({
  newsApi: { list: () => new Promise(() => {}) },
}))

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  it('renders loading state initially', () => {
    renderDashboard()
    expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument()
  })
})
