import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import PurchasesPage from './PurchasesPage'

it('purchases page renders heading', () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter><PurchasesPage /></MemoryRouter></AuthProvider></QueryClientProvider>)
  expect(screen.getByRole('heading', { name: /purchases/i })).toBeInTheDocument()
})
