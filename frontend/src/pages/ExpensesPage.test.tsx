import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import ExpensesPage from './ExpensesPage'

it('expenses page renders heading and form', () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  render(
    <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
      <ExpensesPage />
    </MemoryRouter></AuthProvider></QueryClientProvider>
  )
  expect(screen.getByRole('heading', { name: /expenses/i })).toBeInTheDocument()
  expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
})
