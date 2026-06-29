import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import AttendancePage from './AttendancePage'

it('attendance page renders heading and clock buttons', () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  render(
    <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
      <AttendancePage />
    </MemoryRouter></AuthProvider></QueryClientProvider>
  )
  expect(screen.getByRole('heading', { name: /attendance/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /clock in/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /clock out/i })).toBeInTheDocument()
})
