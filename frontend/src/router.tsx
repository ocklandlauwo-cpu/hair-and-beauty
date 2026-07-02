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
import ProductFormPage from '@/pages/products/ProductFormPage'
import ReconciliationPage from '@/pages/ReconciliationPage'
import AttendancePage from '@/pages/AttendancePage'
import ExpensesPage from '@/pages/ExpensesPage'
import PnlPage from '@/pages/PnlPage'
import NewsPage from '@/pages/NewsPage'
import ClientsPage from '@/pages/ClientsPage'
import CategoriesPage from '@/pages/CategoriesPage'
import GraphicalViewPage from '@/pages/GraphicalViewPage'

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
          { path: 'clients', element: <ClientsPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'stock', element: <StockPage /> },
          { path: 'distributions', element: <DistributionsPage /> },
          { path: 'distributions/:id/confirm', element: <ConfirmDistributionPage /> },
          { path: 'sales', element: <SalesPage /> },
          { path: 'reconciliations', element: <ReconciliationPage /> },
          { path: 'attendance', element: <AttendancePage /> },
          { path: 'expenses', element: <ExpensesPage /> },
          { path: 'news', element: <NewsPage /> },
          // Admin only
          {
            element: <RoleRoute allow={['admin']} />,
            children: [
              { path: 'users', element: <UsersPage /> },
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'graphical-view', element: <GraphicalViewPage /> },
              { path: 'products/new', element: <ProductFormPage /> },
              { path: 'products/:id/edit', element: <ProductFormPage /> },
            ],
          },
          // Admin + store_keeper
          {
            element: <RoleRoute allow={['admin', 'store_keeper']} />,
            children: [
              { path: 'purchases', element: <PurchasesPage /> },
              { path: 'purchases/new', element: <NewPurchasePage /> },
              { path: 'distributions/new', element: <CreateDistributionPage /> },
              { path: 'reports/pnl', element: <PnlPage /> },
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
