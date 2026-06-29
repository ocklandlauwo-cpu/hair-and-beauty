import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'
import RoleRoute from '@/components/RoleRoute'
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
import ReconciliationPage from '@/pages/ReconciliationPage'

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
          // All authenticated roles
          { index: true, element: <DashboardPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'stock', element: <StockPage /> },
          { path: 'distributions', element: <DistributionsPage /> },
          { path: 'distributions/:id/confirm', element: <ConfirmDistributionPage /> },
          { path: 'sales', element: <SalesPage /> },
          { path: 'reconciliations', element: <ReconciliationPage /> },
          // Admin only
          {
            element: <RoleRoute allow={['admin']} />,
            children: [
              { path: 'users', element: <UsersPage /> },
            ],
          },
          // Admin + store_keeper
          {
            element: <RoleRoute allow={['admin', 'store_keeper']} />,
            children: [
              { path: 'purchases', element: <PurchasesPage /> },
              { path: 'purchases/new', element: <NewPurchasePage /> },
              { path: 'distributions/new', element: <CreateDistributionPage /> },
            ],
          },
          // Admin + seller
          {
            element: <RoleRoute allow={['admin', 'seller']} />,
            children: [
              { path: 'sales/new', element: <NewSalePage /> },
            ],
          },
        ],
      },
    ],
  },
])
