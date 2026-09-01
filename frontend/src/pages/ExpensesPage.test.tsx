import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import ExpensesPage from './ExpensesPage'
import { expensesApi } from '@/api/expenses'

vi.mock('@/api/expenses', () => ({
  EXPENSE_CATEGORIES: ['salary', 'security', 'electricity', 'cleanliness', 'rent', 'transport'],
  BUSINESS_LINES: ['shop', 'saloon'],
  expensesApi: {
    list: vi.fn(() => new Promise(() => {})),
    create: vi.fn(() => Promise.resolve({ data: { data: {} } })),
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
      <ExpensesPage />
    </MemoryRouter></AuthProvider></QueryClientProvider>
  )
}

it('expenses page renders heading and form', () => {
  renderPage()
  expect(screen.getByRole('heading', { name: /expenses/i })).toBeInTheDocument()
  expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
})

describe('ExpensesPage business line', () => {
  it('submits business_line "saloon" when the Saloon Center option is chosen', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByLabelText(/business line/i), 'saloon')
    await user.type(screen.getByLabelText(/amount/i), '5000')
    await user.click(screen.getByRole('button', { name: /record expense/i }))

    expect(expensesApi.create).toHaveBeenCalledWith(expect.objectContaining({ business_line: 'saloon' }), expect.anything())
  })

  it('defaults to business_line "shop"', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/amount/i), '5000')
    await user.click(screen.getByRole('button', { name: /record expense/i }))

    expect(expensesApi.create).toHaveBeenCalledWith(expect.objectContaining({ business_line: 'shop' }), expect.anything())
  })
})
