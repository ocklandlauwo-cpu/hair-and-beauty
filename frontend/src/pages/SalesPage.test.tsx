import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import SalesPage from './SalesPage'

it('sales page renders heading', () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter><SalesPage /></MemoryRouter></AuthProvider></QueryClientProvider>)
  expect(screen.getByRole('heading', { name: /sales/i })).toBeInTheDocument()
})
