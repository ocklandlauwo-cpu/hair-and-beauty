import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ProductsPage from '@/pages/ProductsPage'
import StockPage from '@/pages/StockPage'
import DistributionsPage from '@/pages/DistributionsPage'
import CreateDistributionPage from '@/pages/distributions/CreateDistributionPage'
import ConfirmDistributionPage from '@/pages/distributions/ConfirmDistributionPage'

// Lazy-loaded pages (added in later tasks — import as needed)
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
          { path: 'distributions', element: <DistributionsPage /> },
          { path: 'distributions/new', element: <CreateDistributionPage /> },
          { path: 'distributions/:id/confirm', element: <ConfirmDistributionPage /> },
        ],
      },
    ],
  },
])
