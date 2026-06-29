import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ProductsPage from '@/pages/ProductsPage'
import StockPage from '@/pages/StockPage'

// Lazy-loaded pages (added in later tasks — import as needed)
// import DistributionsPage from '@/pages/DistributionsPage'
// import SalesPage from '@/pages/SalesPage'
// import PurchasesPage from '@/pages/PurchasesPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'stock', element: <StockPage /> },
        ],
      },
    ],
  },
])
