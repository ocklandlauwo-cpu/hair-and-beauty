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
import SalesPage from '@/pages/SalesPage'
import NewSalePage from '@/pages/sales/NewSalePage'
import PurchasesPage from '@/pages/PurchasesPage'
import NewPurchasePage from '@/pages/purchases/NewPurchasePage'
import UsersPage from '@/pages/UsersPage'

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
          { path: 'sales', element: <SalesPage /> },
          { path: 'sales/new', element: <NewSalePage /> },
          { path: 'purchases', element: <PurchasesPage /> },
          { path: 'purchases/new', element: <NewPurchasePage /> },
          { path: 'users', element: <UsersPage /> },
        ],
      },
    ],
  },
])
