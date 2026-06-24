import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import AppLayout from './AppLayout'

function makeRouter() {
  return createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [{ index: true, element: <div>content</div> }],
      },
    ],
    { initialEntries: ['/'] },
  )
}

it('renders sidebar and main content area', () => {
  render(<RouterProvider router={makeRouter()} />)
  expect(screen.getByRole('complementary')).toBeInTheDocument()
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(screen.getByText('Hair & Beauty')).toBeInTheDocument()
  expect(screen.getByText('content')).toBeInTheDocument()
})
