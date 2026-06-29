import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import ReconciliationPage from './ReconciliationPage'

it('reconciliation page renders heading and form', () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  render(
    <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
      <ReconciliationPage />
    </MemoryRouter></AuthProvider></QueryClientProvider>
  )
  expect(screen.getByRole('heading', { name: /daily reconciliation/i })).toBeInTheDocument()
  expect(screen.getByLabelText(/total sold today/i)).toBeInTheDocument()
})
