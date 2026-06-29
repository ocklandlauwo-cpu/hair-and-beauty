import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import PnlPage from './PnlPage'

it('P&L page renders date inputs and download button', () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  render(
    <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
      <PnlPage />
    </MemoryRouter></AuthProvider></QueryClientProvider>
  )
  expect(screen.getByRole('heading', { name: /p.l report/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /download monthly pdf/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /generate report/i })).toBeInTheDocument()
})
