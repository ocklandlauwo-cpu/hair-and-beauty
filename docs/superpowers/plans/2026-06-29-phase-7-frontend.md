# Phase 7: Frontend Integration — React SPA Wired to API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 1 React SPA scaffold to the live API — building auth, navigation, dashboard, catalogue/stock, distribution workflow, and POS screens sufficient for daily operations by all three roles before the August 1 launch.

**Architecture:** Auth state lives in `AuthContext` (localStorage-backed, populated by `/auth/me` on first load). All API calls use the existing Axios instance (`@/lib/axios`) with bearer token interceptor. Server state is managed by TanStack Query v5 — no separate global state library. All pages sit under a `ProtectedRoute` wrapper that redirects unauthenticated users to `/login`. The sidebar renders role-filtered navigation links. Design follows the established brand system (primary-600 `#2E75B6`, primary-900 `#1F3A5F`, 14px body, 40px controls).

**Tech Stack:** React 19 / TypeScript 5.9 / Vite 7 / Tailwind CSS v4 / React Router DOM 7 / TanStack Query 5 / React Hook Form 7 / Zod 4 / Axios 1 / Vitest 4 + React Testing Library 16

## Global Constraints

- Node commands run from `frontend/` directory: `npm run dev`, `npx vitest run`, `npx tsc --noEmit`
- `@/` alias resolves to `src/` (tsconfig + vite already configured)
- Vitest `globals: false` — import `describe`/`it`/`expect` from `'vitest'`; import matchers from `'@testing-library/jest-dom/matchers'`
- Brand colors: `bg-primary-600` (#2E75B6 buttons/accents), `bg-primary-900` (#1F3A5F sidebar)
- Body font-size: 14px (set globally in index.css); control height: h-10 (2.5rem = 40px)
- Light mode only; WCAG 2.1 AA required; `lucide-react` for all icons
- Authorization: check `user.role` directly — values: `'admin'` | `'store_keeper'` | `'seller'`
- Money: display TZS amounts with `Number(value).toLocaleString('en-US')` — e.g. "1,250,000"
- API base URL: `import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'`
- No cash payment — only nmb, airtel, vodacom, tigo
- `localStorage` keys: `auth_token` (bearer token), `auth_user` (JSON-stringified User)
- All page tests use `MemoryRouter` or `createMemoryRouter` — never `BrowserRouter` in tests
- `src/types/index.ts` already defines: `User`, `Role`, `ApiResponse<T>`, `PaginatedResponse<T>`, `ApiError`

---

## Task 1: Auth Flow — login form, AuthContext, ProtectedRoute, navigation

**Files:**
- Create: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/src/hooks/useAuth.ts` (re-exports from context for convenience)
- Create: `frontend/src/components/ProtectedRoute.tsx`
- Modify: `frontend/src/pages/auth/LoginPage.tsx` (real form with RHF + Zod)
- Modify: `frontend/src/components/layout/Sidebar.tsx` (role-filtered nav links)
- Modify: `frontend/src/components/layout/Header.tsx` (user name + logout button)
- Modify: `frontend/src/router.tsx` (add ProtectedRoute wrapper + all page routes)
- Modify: `frontend/src/main.tsx` (wrap with AuthProvider)
- Test: `frontend/src/contexts/AuthContext.test.tsx`
- Test: `frontend/src/pages/auth/LoginPage.test.tsx`

**Interfaces:**
- Produces: `useAuth(): { user: User|null, login(token, user): void, logout(): void, isAuthenticated: boolean }` — consumed by all tasks

- [ ] **Step 1: Create `frontend/src/contexts/AuthContext.tsx`**

  ```tsx
  import { createContext, useCallback, useContext, useState } from 'react'
  import type { ReactNode } from 'react'
  import type { User } from '@/types'

  interface AuthContextValue {
    user: User | null
    isAuthenticated: boolean
    login: (token: string, user: User) => void
    logout: () => void
  }

  const AuthContext = createContext<AuthContextValue | null>(null)

  export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
      try {
        const stored = localStorage.getItem('auth_user')
        return stored ? (JSON.parse(stored) as User) : null
      } catch {
        return null
      }
    })

    const login = useCallback((token: string, newUser: User) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', JSON.stringify(newUser))
      setUser(newUser)
    }, [])

    const logout = useCallback(() => {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      setUser(null)
    }, [])

    return (
      <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
        {children}
      </AuthContext.Provider>
    )
  }

  export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
  }
  ```

- [ ] **Step 2: Create `frontend/src/hooks/useAuth.ts`**

  ```ts
  export { useAuth } from '@/contexts/AuthContext'
  ```

- [ ] **Step 3: Write tests for AuthContext in `frontend/src/contexts/AuthContext.test.tsx`**

  ```tsx
  import { describe, it, expect, beforeEach } from 'vitest'
  import { renderHook, act } from '@testing-library/react'
  import { AuthProvider, useAuth } from './AuthContext'
  import type { User } from '@/types'

  const mockUser: User = { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin', location_id: null, is_active: true, created_at: '', updated_at: '' }

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  beforeEach(() => {
    localStorage.clear()
  })

  describe('AuthContext', () => {
    it('starts unauthenticated', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.user).toBeNull()
    })

    it('login sets user and token', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      act(() => { result.current.login('tok123', mockUser) })
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.email).toBe('admin@test.com')
      expect(localStorage.getItem('auth_token')).toBe('tok123')
    })

    it('logout clears user and storage', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      act(() => { result.current.login('tok', mockUser) })
      act(() => { result.current.logout() })
      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorage.getItem('auth_token')).toBeNull()
    })
  })
  ```

- [ ] **Step 4: Run tests — expect PASS**

  ```bash
  cd frontend
  npx vitest run src/contexts/AuthContext.test.tsx
  ```

- [ ] **Step 5: Create `frontend/src/components/ProtectedRoute.tsx`**

  ```tsx
  import { Navigate, Outlet } from 'react-router-dom'
  import { useAuth } from '@/contexts/AuthContext'

  export default function ProtectedRoute() {
    const { isAuthenticated } = useAuth()
    return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
  }
  ```

- [ ] **Step 6: Rewrite `frontend/src/pages/auth/LoginPage.tsx`** (real login form)

  ```tsx
  import { useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { useForm } from 'react-hook-form'
  import { z } from 'zod/v4'
  import { zodResolver } from '@hookform/resolvers/zod'
  import { authApi } from '@/api/auth'
  import { useAuth } from '@/contexts/AuthContext'

  const schema = z.object({
    email: z.email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  })
  type FormValues = z.infer<typeof schema>

  export default function LoginPage() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [serverError, setServerError] = useState<string | null>(null)

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
      resolver: zodResolver(schema),
    })

    const onSubmit = async (values: FormValues) => {
      setServerError(null)
      try {
        const res = await authApi.login(values)
        const { token, user } = res.data.data
        login(token, user)
        navigate('/', { replace: true })
      } catch {
        setServerError('Invalid email or password.')
      }
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm space-y-6 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Hair & Beauty</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 h-10 text-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                {...register('email')}
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 h-10 text-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                {...register('password')}
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            {serverError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 7: Write `frontend/src/pages/auth/LoginPage.test.tsx`**

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { AuthProvider } from '@/contexts/AuthContext'
  import LoginPage from './LoginPage'

  function renderLogin() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )
  }

  describe('LoginPage', () => {
    it('renders email and password fields', () => {
      renderLogin()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 8: Update `frontend/src/components/layout/Sidebar.tsx`** with role-filtered navigation

  ```tsx
  import { NavLink } from 'react-router-dom'
  import { LayoutDashboard, Package, Boxes, Truck, ShoppingCart, CreditCard, FileText, Users, TrendingUp } from 'lucide-react'
  import { useAuth } from '@/contexts/AuthContext'
  import { cn } from '@/lib/utils'

  const allLinks = [
    { to: '/',             label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin', 'store_keeper', 'seller'] as const },
    { to: '/products',     label: 'Products',     icon: Package,         roles: ['admin', 'store_keeper', 'seller'] as const },
    { to: '/stock',        label: 'Stock',        icon: Boxes,           roles: ['admin', 'store_keeper', 'seller'] as const },
    { to: '/purchases',    label: 'Purchases',    icon: CreditCard,      roles: ['admin', 'store_keeper'] as const },
    { to: '/distributions',label: 'Distributions',icon: Truck,           roles: ['admin', 'store_keeper', 'seller'] as const },
    { to: '/sales',        label: 'Sales',        icon: ShoppingCart,    roles: ['admin', 'store_keeper', 'seller'] as const },
    { to: '/news',         label: 'News',         icon: FileText,        roles: ['admin', 'store_keeper', 'seller'] as const },
    { to: '/users',        label: 'Users',        icon: Users,           roles: ['admin'] as const },
    { to: '/reports/pnl',  label: 'P&L Report',   icon: TrendingUp,      roles: ['admin', 'store_keeper'] as const },
  ]

  export default function Sidebar() {
    const { user } = useAuth()
    const role = user?.role ?? 'seller'
    const links = allLinks.filter(l => l.roles.includes(role as never))

    return (
      <aside
        className="flex w-64 shrink-0 flex-col bg-primary-900"
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center px-6">
          <span className="text-sm font-semibold text-white">Hair & Beauty</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 h-9 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
    )
  }
  ```

- [ ] **Step 9: Update `frontend/src/components/layout/Header.tsx`** with user info + logout

  ```tsx
  import { LogOut } from 'lucide-react'
  import { useNavigate } from 'react-router-dom'
  import { useAuth } from '@/contexts/AuthContext'
  import { authApi } from '@/api/auth'

  export default function Header() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const handleLogout = async () => {
      try { await authApi.logout() } catch { /* ignore */ }
      logout()
      navigate('/login', { replace: true })
    }

    return (
      <header className="flex h-16 shrink-0 items-center border-b border-gray-200 bg-white px-6">
        <div className="flex flex-1 items-center justify-between">
          <div />
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-gray-600">
                {user.name}
                <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 capitalize">
                  {user.role.replace('_', ' ')}
                </span>
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 h-8 text-sm text-gray-600 hover:bg-gray-50"
              aria-label="Sign out"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </header>
    )
  }
  ```

- [ ] **Step 10: Update `frontend/src/router.tsx`** with ProtectedRoute and all page routes

  ```tsx
  import { createBrowserRouter } from 'react-router-dom'
  import ProtectedRoute from '@/components/ProtectedRoute'
  import AppLayout from '@/components/layout/AppLayout'
  import LoginPage from '@/pages/auth/LoginPage'
  import DashboardPage from '@/pages/DashboardPage'

  // Lazy-loaded pages (added in later tasks — import as needed)
  // import ProductsPage from '@/pages/ProductsPage'
  // import StockPage from '@/pages/StockPage'
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
          ],
        },
      ],
    },
  ])
  ```

- [ ] **Step 11: Update `frontend/src/main.tsx`** to wrap app in `AuthProvider`

  ```tsx
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import { RouterProvider } from 'react-router-dom'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { AuthProvider } from './contexts/AuthContext'
  import { router } from './router'
  import './index.css'

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 1 },
    },
  })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
  ```

- [ ] **Step 12: Run all frontend tests — expect PASS**

  ```bash
  cd frontend
  npx vitest run
  ```

  Expected: all existing tests + 4 new auth tests passing.

- [ ] **Step 13: Verify TypeScript compiles clean**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no output (no errors).

- [ ] **Step 14: Commit**

  ```bash
  cd ..
  git add frontend/src/contexts/ frontend/src/hooks/ \
          frontend/src/components/ProtectedRoute.tsx \
          frontend/src/pages/auth/ frontend/src/components/layout/ \
          frontend/src/router.tsx frontend/src/main.tsx
  git commit -m "feat(frontend): auth flow — login form, AuthContext, ProtectedRoute, nav"
  ```

---

## Task 2: Dashboard page (live data) + shared UI primitives

**Files:**
- Create: `frontend/src/components/ui/StatCard.tsx`
- Create: `frontend/src/components/ui/Badge.tsx`
- Create: `frontend/src/api/dashboard.ts`
- Modify: `frontend/src/pages/DashboardPage.tsx` (real data via TanStack Query)
- Create: `frontend/src/api/news.ts`
- Test: `frontend/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` for `user.role`; `GET /api/v1/dashboard`; `GET /api/v1/news`
- Produces: `StatCard` component, `Badge` component — consumed by Tasks 3–6

- [ ] **Step 1: Create `frontend/src/components/ui/StatCard.tsx`**

  ```tsx
  import { cn } from '@/lib/utils'

  interface StatCardProps {
    label: string
    value: string | number
    sub?: string
    className?: string
  }

  export default function StatCard({ label, value, sub, className }: StatCardProps) {
    return (
      <div className={cn('rounded-lg border border-gray-200 bg-white p-5', className)}>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
        {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
      </div>
    )
  }
  ```

- [ ] **Step 2: Create `frontend/src/components/ui/Badge.tsx`**

  ```tsx
  import { cn } from '@/lib/utils'

  const variants = {
    default:    'bg-gray-100 text-gray-700',
    primary:    'bg-primary-50 text-primary-700',
    success:    'bg-green-100 text-green-700',
    warning:    'bg-yellow-100 text-yellow-700',
    danger:     'bg-red-100 text-red-700',
    info:       'bg-blue-100 text-blue-700',
  } as const

  interface BadgeProps {
    children: React.ReactNode
    variant?: keyof typeof variants
    className?: string
  }

  export default function Badge({ children, variant = 'default', className }: BadgeProps) {
    return (
      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', variants[variant], className)}>
        {children}
      </span>
    )
  }
  ```

- [ ] **Step 3: Create `frontend/src/api/dashboard.ts`**

  ```ts
  import api from '@/lib/axios'

  export interface AdminDashboard {
    role: 'admin'
    sales: { today: string; this_month: string }
    expenses: { this_month: string }
    distributions: { pending: number }
    stock: { expiry_alerts: number; low_stock_alerts: number }
    users: { active: number }
  }

  export interface StoreKeeperDashboard {
    role: 'store_keeper'
    distributions: { pending: number; this_week: number }
    purchases: { this_month_count: number }
    stock: { expiry_alerts: number; low_stock_alerts: number }
  }

  export interface SellerDashboard {
    role: 'seller'
    sales_today: string
    sales_count_today: number
    reconciliation_pending: boolean
    low_stock_count: number
    attendance_today: 'clock_in' | 'clock_out' | null
  }

  export type DashboardData = AdminDashboard | StoreKeeperDashboard | SellerDashboard

  export const dashboardApi = {
    get: () => api.get<{ data: DashboardData }>('/dashboard'),
  }
  ```

- [ ] **Step 4: Create `frontend/src/api/news.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse } from '@/types'

  export interface NewsItem {
    id: number
    title: string
    body: string
    is_published: boolean
    published_at: string | null
    created_at: string
  }

  export const newsApi = {
    list: (page = 1) =>
      api.get<PaginatedResponse<NewsItem>>('/news', { params: { page } }),
  }
  ```

- [ ] **Step 5: Rewrite `frontend/src/pages/DashboardPage.tsx`**

  ```tsx
  import { useQuery } from '@tanstack/react-query'
  import { AlertTriangle, ArrowUpCircle, Clock, ShoppingCart, TrendingUp, Users } from 'lucide-react'
  import { dashboardApi } from '@/api/dashboard'
  import { newsApi } from '@/api/news'
  import { useAuth } from '@/contexts/AuthContext'
  import StatCard from '@/components/ui/StatCard'
  import Badge from '@/components/ui/Badge'

  function formatTzs(value: string | number) {
    return `TZS ${Number(value).toLocaleString('en-US')}`
  }

  export default function DashboardPage() {
    const { user } = useAuth()

    const { data: dashData, isLoading: dashLoading } = useQuery({
      queryKey: ['dashboard'],
      queryFn: () => dashboardApi.get().then(r => r.data.data),
    })

    const { data: newsData } = useQuery({
      queryKey: ['news'],
      queryFn: () => newsApi.list().then(r => r.data),
    })

    if (dashLoading) {
      return <div className="p-6 text-sm text-gray-500">Loading dashboard…</div>
    }

    const news = newsData?.data ?? []

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Welcome, {user?.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500 capitalize">
            {user?.role?.replace('_', ' ')} dashboard
          </p>
        </div>

        {/* Admin dashboard */}
        {dashData?.role === 'admin' && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard label="Sales Today" value={formatTzs(dashData.sales.today)} />
            <StatCard label="Sales This Month" value={formatTzs(dashData.sales.this_month)} />
            <StatCard label="Expenses This Month" value={formatTzs(dashData.expenses.this_month)} />
            <StatCard label="Pending Distributions" value={dashData.distributions.pending} />
            <StatCard label="Expiry Alerts" value={dashData.stock.expiry_alerts} sub="batches expiring in 60 days" />
            <StatCard label="Low Stock Alerts" value={dashData.stock.low_stock_alerts} sub="< 30 days cover" />
          </div>
        )}

        {/* Store-keeper dashboard */}
        {dashData?.role === 'store_keeper' && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard label="Pending Distributions" value={dashData.distributions.pending} />
            <StatCard label="Distributions This Week" value={dashData.distributions.this_week} />
            <StatCard label="Purchases This Month" value={dashData.purchases.this_month_count} />
            <StatCard label="Expiry Alerts" value={dashData.stock.expiry_alerts} />
            <StatCard label="Low Stock Alerts" value={dashData.stock.low_stock_alerts} />
          </div>
        )}

        {/* Seller dashboard */}
        {dashData?.role === 'seller' && (
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Sales Today" value={formatTzs(dashData.sales_today)} sub={`${dashData.sales_count_today} transactions`} />
            <StatCard
              label="Daily Reconciliation"
              value={dashData.reconciliation_pending ? 'Pending' : 'Submitted'}
            />
            <StatCard label="Low Stock Items" value={dashData.low_stock_count} />
            <StatCard
              label="Attendance"
              value={dashData.attendance_today
                ? (dashData.attendance_today === 'clock_in' ? 'Clocked In' : 'Clocked Out')
                : 'Not recorded'}
            />
          </div>
        )}

        {/* News feed */}
        {news.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Announcements</h2>
            <div className="space-y-3">
              {news.slice(0, 3).map(item => (
                <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <h3 className="text-sm font-medium text-gray-900">{item.title}</h3>
                  <p className="mt-1 text-xs text-gray-500 line-clamp-2">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 6: Write `frontend/src/pages/DashboardPage.test.tsx`**

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { AuthProvider } from '@/contexts/AuthContext'
  import DashboardPage from './DashboardPage'

  function renderDashboard() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
    return render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )
  }

  describe('DashboardPage', () => {
    it('renders loading state initially', () => {
      renderDashboard()
      expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 7: Run tests + tsc + Commit**

  ```bash
  cd frontend
  npx vitest run
  npx tsc --noEmit
  cd ..
  git add frontend/src/components/ui/ frontend/src/api/dashboard.ts frontend/src/api/news.ts \
          frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.test.tsx
  git commit -m "feat(frontend): live dashboard with role-specific KPIs, news feed, StatCard/Badge UI"
  ```

---

## Task 3: Products & Stock pages

**Files:**
- Create: `frontend/src/api/products.ts`
- Create: `frontend/src/api/stock.ts`
- Create: `frontend/src/components/ui/DataTable.tsx`
- Create: `frontend/src/pages/ProductsPage.tsx`
- Create: `frontend/src/pages/StockPage.tsx`
- Modify: `frontend/src/router.tsx` (add /products and /stock routes)
- Test: `frontend/src/pages/ProductsPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/products`, `GET /api/v1/stock`, `GET /api/v1/stock/alerts/expiry`, `GET /api/v1/stock/alerts/low`
- Produces: `DataTable` component — consumed by Tasks 4–6

- [ ] **Step 1: Create `frontend/src/api/products.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse, ApiResponse } from '@/types'

  export interface Product {
    id: number
    category_id: number
    category_name?: string
    name: string
    sku: string | null
    unit: string
    wholesale_threshold: number
    wholesale_price: string
    retail_price: string
    latest_cost: string
    is_active: boolean
  }

  export const productsApi = {
    list: (params?: { page?: number; search?: string }) =>
      api.get<PaginatedResponse<Product>>('/products', { params }),
    show: (id: number) =>
      api.get<ApiResponse<Product>>(`/products/${id}`),
  }
  ```

- [ ] **Step 2: Create `frontend/src/api/stock.ts`**

  ```ts
  import api from '@/lib/axios'

  export interface StockRow {
    product_id: number
    product_name: string
    sku: string | null
    location_id: number
    location_name: string
    location_type: string
    current_stock: number
  }

  export interface ExpiryAlert {
    batch_id: number
    product_id: number
    product_name: string
    batch_number: string | null
    expiry_date: string
    days_until_expiry: number
  }

  export interface LowStockAlert {
    product_id: number
    product_name: string
    location_id: number
    location_name: string
    current_stock: number
    avg_daily_sales: string
    days_of_cover: number | null
  }

  export const stockApi = {
    current: () => api.get<{ data: StockRow[] }>('/stock'),
    expiryAlerts: () => api.get<{ data: ExpiryAlert[] }>('/stock/alerts/expiry'),
    lowStockAlerts: () => api.get<{ data: LowStockAlert[] }>('/stock/alerts/low'),
  }
  ```

- [ ] **Step 3: Create `frontend/src/components/ui/DataTable.tsx`**

  ```tsx
  interface Column<T> {
    key: string
    header: string
    render?: (row: T) => React.ReactNode
    className?: string
  }

  interface DataTableProps<T extends { id: number }> {
    columns: Column<T>[]
    data: T[]
    emptyMessage?: string
    isLoading?: boolean
  }

  export default function DataTable<T extends { id: number }>({
    columns,
    data,
    emptyMessage = 'No records found.',
    isLoading,
  }: DataTableProps<T>) {
    if (isLoading) {
      return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
    }

    if (data.length === 0) {
      return <div className="py-12 text-center text-sm text-gray-400">{emptyMessage}</div>
    }

    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map(row => (
              <tr key={row.id} className="hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 text-gray-700 ${col.className ?? ''}`}>
                    {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  ```

- [ ] **Step 4: Create `frontend/src/pages/ProductsPage.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useQuery } from '@tanstack/react-query'
  import { Search } from 'lucide-react'
  import { productsApi, type Product } from '@/api/products'
  import DataTable from '@/components/ui/DataTable'
  import Badge from '@/components/ui/Badge'

  const columns = [
    { key: 'name', header: 'Product' },
    { key: 'sku', header: 'SKU', render: (p: Product) => p.sku ?? '—' },
    { key: 'category_name', header: 'Category', render: (p: Product) => p.category_name ?? '—' },
    { key: 'retail_price', header: 'Retail (TZS)', render: (p: Product) => Number(p.retail_price).toLocaleString('en-US') },
    { key: 'wholesale_price', header: 'Wholesale (TZS)', render: (p: Product) => Number(p.wholesale_price).toLocaleString('en-US') },
    { key: 'latest_cost', header: 'Cost (TZS)', render: (p: Product) => Number(p.latest_cost).toLocaleString('en-US') },
    { key: 'is_active', header: 'Status', render: (p: Product) => <Badge variant={p.is_active ? 'success' : 'default'}>{p.is_active ? 'Active' : 'Inactive'}</Badge> },
  ]

  export default function ProductsPage() {
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')

    const { data, isLoading } = useQuery({
      queryKey: ['products', page, search],
      queryFn: () => productsApi.list({ page, search: search || undefined }).then(r => r.data),
    })

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Products</h1>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search products…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 pr-3 h-9 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          emptyMessage="No products found."
        />

        {data && data.meta.last_page > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Page {data.meta.current_page} of {data.meta.last_page} ({data.meta.total} total)</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                disabled={page === data.meta.last_page}
                onClick={() => setPage(p => p + 1)}
                className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 5: Create `frontend/src/pages/StockPage.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useQuery } from '@tanstack/react-query'
  import { AlertTriangle, Clock, Package } from 'lucide-react'
  import { stockApi, type StockRow, type ExpiryAlert, type LowStockAlert } from '@/api/stock'
  import DataTable from '@/components/ui/DataTable'
  import Badge from '@/components/ui/Badge'

  type Tab = 'current' | 'expiry' | 'low'

  const currentColumns = [
    { key: 'product_name', header: 'Product' },
    { key: 'location_name', header: 'Location' },
    { key: 'location_type', header: 'Type', render: (r: StockRow) => <Badge>{r.location_type}</Badge> },
    { key: 'current_stock', header: 'Stock', render: (r: StockRow) => (
      <span className={r.current_stock < 0 ? 'text-red-600 font-medium' : ''}>{r.current_stock}</span>
    )},
  ]

  const expiryColumns = [
    { key: 'product_name', header: 'Product' },
    { key: 'batch_number', header: 'Batch', render: (r: ExpiryAlert) => r.batch_number ?? '—' },
    { key: 'expiry_date', header: 'Expires' },
    { key: 'days_until_expiry', header: 'Days Left', render: (r: ExpiryAlert) => (
      <Badge variant={r.days_until_expiry <= 14 ? 'danger' : r.days_until_expiry <= 30 ? 'warning' : 'default'}>
        {r.days_until_expiry}d
      </Badge>
    )},
  ]

  const lowStockColumns = [
    { key: 'product_name', header: 'Product' },
    { key: 'location_name', header: 'Location' },
    { key: 'current_stock', header: 'Stock' },
    { key: 'avg_daily_sales', header: 'Avg Daily Sales', render: (r: LowStockAlert) => Number(r.avg_daily_sales).toFixed(1) },
    { key: 'days_of_cover', header: 'Days Cover', render: (r: LowStockAlert) => (
      <Badge variant={r.days_of_cover !== null && r.days_of_cover <= 7 ? 'danger' : 'warning'}>
        {r.days_of_cover ?? '—'}d
      </Badge>
    )},
  ]

  export default function StockPage() {
    const [tab, setTab] = useState<Tab>('current')

    const { data: currentData, isLoading: l1 } = useQuery({ queryKey: ['stock'], queryFn: () => stockApi.current().then(r => r.data.data), enabled: tab === 'current' })
    const { data: expiryData, isLoading: l2 } = useQuery({ queryKey: ['stock-expiry'], queryFn: () => stockApi.expiryAlerts().then(r => r.data.data), enabled: tab === 'expiry' })
    const { data: lowData, isLoading: l3 } = useQuery({ queryKey: ['stock-low'], queryFn: () => stockApi.lowStockAlerts().then(r => r.data.data), enabled: tab === 'low' })

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Stock & Inventory</h1>

        <div className="flex gap-1 border-b border-gray-200">
          {([['current', 'Current Stock', Package], ['expiry', 'Expiry Alerts', Clock], ['low', 'Low Stock', AlertTriangle]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {tab === 'current' && <DataTable columns={currentColumns} data={(currentData ?? []) as StockRow[]} isLoading={l1} emptyMessage="No stock data." />}
        {tab === 'expiry' && <DataTable columns={expiryColumns} data={(expiryData ?? []) as ExpiryAlert[]} isLoading={l2} emptyMessage="No expiry alerts." />}
        {tab === 'low' && <DataTable columns={lowStockColumns} data={(lowData ?? []) as LowStockAlert[]} isLoading={l3} emptyMessage="No low stock alerts." />}
      </div>
    )
  }
  ```

- [ ] **Step 6: Write `frontend/src/pages/ProductsPage.test.tsx`**

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { AuthProvider } from '@/contexts/AuthContext'
  import ProductsPage from './ProductsPage'

  it('products page renders search and table skeleton', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
    render(
      <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
        <ProductsPage />
      </MemoryRouter></AuthProvider></QueryClientProvider>
    )
    expect(screen.getByRole('heading', { name: /products/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })
  ```

- [ ] **Step 7: Add routes to `frontend/src/router.tsx`** (add products and stock after DashboardPage):

  ```tsx
  import ProductsPage from '@/pages/ProductsPage'
  import StockPage from '@/pages/StockPage'
  // ...inside AppLayout children:
  { path: 'products', element: <ProductsPage /> },
  { path: 'stock', element: <StockPage /> },
  ```

- [ ] **Step 8: Run tests + tsc + Commit**

  ```bash
  cd frontend && npx vitest run && npx tsc --noEmit
  cd ..
  git add frontend/src/api/products.ts frontend/src/api/stock.ts \
          frontend/src/components/ui/DataTable.tsx \
          frontend/src/pages/ProductsPage.tsx frontend/src/pages/StockPage.tsx \
          frontend/src/pages/ProductsPage.test.tsx frontend/src/router.tsx
  git commit -m "feat(frontend): products list with search/pagination, stock/expiry/low-stock views"
  ```

---

## Task 4: Distribution workflow — list, create form, confirm flow

**Files:**
- Create: `frontend/src/api/distributions.ts`
- Create: `frontend/src/pages/DistributionsPage.tsx`
- Create: `frontend/src/pages/distributions/CreateDistributionPage.tsx`
- Create: `frontend/src/pages/distributions/ConfirmDistributionPage.tsx`
- Modify: `frontend/src/router.tsx`
- Test: `frontend/src/pages/DistributionsPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/distributions`, `POST /api/v1/distributions`, `GET /api/v1/locations`, `POST /api/v1/distributions/{id}/confirm`, `GET /api/v1/products`

- [ ] **Step 1: Create `frontend/src/api/distributions.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse, ApiResponse } from '@/types'

  export interface Distribution {
    id: number
    from_location_id: number
    to_location_id: number
    distributed_by: number
    confirmed_by: number | null
    status: 'pending' | 'confirmed' | 'discrepancy'
    distributed_at: string
    confirmed_at: string | null
    notes: string | null
    items?: DistributionItem[]
  }

  export interface DistributionItem {
    id: number
    distribution_id: number
    product_id: number
    quantity_sent: number
    quantity_received: number | null
  }

  export interface CreateDistributionPayload {
    to_location_id: number
    distributed_at: string
    notes?: string
    items: Array<{ product_id: number; quantity_sent: number }>
  }

  export interface ConfirmDistributionPayload {
    items: Array<{ distribution_item_id: number; quantity_received: number }>
  }

  export const distributionsApi = {
    list: (page = 1) =>
      api.get<PaginatedResponse<Distribution>>('/distributions', { params: { page } }),
    show: (id: number) =>
      api.get<ApiResponse<Distribution>>(`/distributions/${id}`),
    create: (data: CreateDistributionPayload) =>
      api.post<ApiResponse<Distribution>>('/distributions', data),
    confirm: (id: number, data: ConfirmDistributionPayload) =>
      api.post<ApiResponse<Distribution>>(`/distributions/${id}/confirm`, data),
  }
  ```

- [ ] **Step 2: Create `frontend/src/api/locations.ts`**

  ```ts
  import api from '@/lib/axios'

  export interface Location {
    id: number
    name: string
    type: 'store' | 'shop'
    is_active: boolean
  }

  export const locationsApi = {
    list: () => api.get<{ data: Location[] }>('/locations'),
  }
  ```

- [ ] **Step 3: Create `frontend/src/pages/DistributionsPage.tsx`**

  ```tsx
  import { Link } from 'react-router-dom'
  import { useQuery } from '@tanstack/react-query'
  import { Plus } from 'lucide-react'
  import { distributionsApi, type Distribution } from '@/api/distributions'
  import { useAuth } from '@/contexts/AuthContext'
  import DataTable from '@/components/ui/DataTable'
  import Badge from '@/components/ui/Badge'

  const statusVariant = {
    pending: 'warning',
    confirmed: 'success',
    discrepancy: 'danger',
  } as const

  const columns = [
    { key: 'id', header: 'ID', render: (d: Distribution) => `#${d.id}` },
    { key: 'status', header: 'Status', render: (d: Distribution) => <Badge variant={statusVariant[d.status]}>{d.status}</Badge> },
    { key: 'distributed_at', header: 'Date', render: (d: Distribution) => new Date(d.distributed_at).toLocaleDateString() },
    { key: 'confirmed_at', header: 'Confirmed', render: (d: Distribution) => d.confirmed_at ? new Date(d.confirmed_at).toLocaleDateString() : '—' },
    { key: 'actions', header: '', render: (d: Distribution) =>
      d.status === 'pending'
        ? <Link to={`/distributions/${d.id}/confirm`} className="text-primary-600 hover:underline text-xs">Confirm</Link>
        : null
    },
  ]

  export default function DistributionsPage() {
    const { user } = useAuth()
    const { data, isLoading } = useQuery({
      queryKey: ['distributions'],
      queryFn: () => distributionsApi.list().then(r => r.data),
    })

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Distributions</h1>
          {(user?.role === 'admin' || user?.role === 'store_keeper') && (
            <Link
              to="/distributions/new"
              className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Plus size={16} /> New Distribution
            </Link>
          )}
        </div>
        <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No distributions yet." />
      </div>
    )
  }
  ```

- [ ] **Step 4: Create `frontend/src/pages/distributions/CreateDistributionPage.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { Plus, Trash2 } from 'lucide-react'
  import { distributionsApi } from '@/api/distributions'
  import { locationsApi } from '@/api/locations'
  import { productsApi } from '@/api/products'

  interface LineItem { product_id: number; product_name: string; quantity_sent: number }

  export default function CreateDistributionPage() {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const [toLocationId, setToLocationId] = useState('')
    const [notes, setNotes] = useState('')
    const [items, setItems] = useState<LineItem[]>([])
    const [productSearch, setProductSearch] = useState('')
    const [error, setError] = useState<string | null>(null)

    const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: () => locationsApi.list().then(r => r.data.data) })
    const { data: products } = useQuery({ queryKey: ['products', 'all'], queryFn: () => productsApi.list({ page: 1 }).then(r => r.data.data) })

    const mutation = useMutation({
      mutationFn: distributionsApi.create,
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['distributions'] }); navigate('/distributions') },
      onError: () => setError('Failed to create distribution. Please try again.'),
    })

    const shops = (locations ?? []).filter(l => l.type === 'shop' && l.is_active)
    const filteredProducts = (products ?? []).filter(p =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) && !items.find(i => i.product_id === p.id)
    )

    const addProduct = (product: { id: number; name: string }) => {
      setItems(prev => [...prev, { product_id: product.id, product_name: product.name, quantity_sent: 1 }])
      setProductSearch('')
    }

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!toLocationId || items.length === 0) { setError('Select a destination and at least one product.'); return }
      mutation.mutate({ to_location_id: Number(toLocationId), distributed_at: new Date().toISOString(), notes: notes || undefined, items: items.map(i => ({ product_id: i.product_id, quantity_sent: i.quantity_sent })) })
    }

    return (
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">New Distribution</h1>

        <div>
          <label className="block text-sm font-medium text-gray-700">Destination Shop</label>
          <select value={toLocationId} onChange={e => setToLocationId(e.target.value)} required
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
            <option value="">Select shop…</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>
          <div className="relative">
            <input type="text" placeholder="Search and add products…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className="block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {productSearch && filteredProducts.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                {filteredProducts.slice(0, 8).map(p => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50">
                    <Plus size={14} className="text-primary-600" /> {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {items.length > 0 && (
            <div className="mt-3 space-y-2">
              {items.map((item, idx) => (
                <div key={item.product_id} className="flex items-center gap-3 rounded-md border border-gray-200 p-3">
                  <span className="flex-1 text-sm">{item.product_name}</span>
                  <input type="number" min={1} value={item.quantity_sent}
                    onChange={e => setItems(prev => prev.map((i, j) => j === idx ? { ...i, quantity_sent: Number(e.target.value) } : i))}
                    className="w-20 rounded border border-gray-300 h-8 px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary-600" />
                  <span className="text-xs text-gray-400">units</span>
                  <button type="button" onClick={() => setItems(prev => prev.filter((_, j) => j !== idx))} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/distributions')} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="rounded-md bg-primary-600 px-6 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {mutation.isPending ? 'Creating…' : 'Create Distribution'}
          </button>
        </div>
      </form>
    )
  }
  ```

- [ ] **Step 5: Create `frontend/src/pages/distributions/ConfirmDistributionPage.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useNavigate, useParams } from 'react-router-dom'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { distributionsApi } from '@/api/distributions'
  import { productsApi } from '@/api/products'

  export default function ConfirmDistributionPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()

    const { data: dist, isLoading } = useQuery({
      queryKey: ['distribution', id],
      queryFn: () => distributionsApi.show(Number(id)).then(r => r.data.data),
    })

    const { data: products } = useQuery({
      queryKey: ['products', 'all'],
      queryFn: () => productsApi.list().then(r => r.data.data),
    })

    const [received, setReceived] = useState<Record<number, number>>({})
    const [error, setError] = useState<string | null>(null)

    const mutation = useMutation({
      mutationFn: (data: Parameters<typeof distributionsApi.confirm>[1]) =>
        distributionsApi.confirm(Number(id), data),
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['distributions'] }); navigate('/distributions') },
      onError: () => setError('Failed to confirm. Please try again.'),
    })

    if (isLoading || !dist) return <div className="p-6 text-sm text-gray-400">Loading…</div>

    const getProductName = (productId: number) =>
      products?.find(p => p.id === productId)?.name ?? `Product #${productId}`

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      const items = (dist.items ?? []).map(item => ({
        distribution_item_id: item.id,
        quantity_received: received[item.id] ?? item.quantity_sent,
      }))
      mutation.mutate({ items })
    }

    return (
      <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">Confirm Distribution #{id}</h1>
        <p className="text-sm text-gray-500">
          Distributed: {new Date(dist.distributed_at).toLocaleDateString()}
        </p>

        <div className="space-y-3">
          {(dist.items ?? []).map(item => (
            <div key={item.id} className="flex items-center gap-4 rounded-md border border-gray-200 p-3">
              <span className="flex-1 text-sm">{getProductName(item.product_id)}</span>
              <span className="text-xs text-gray-500">Sent: {item.quantity_sent}</span>
              <input
                type="number"
                min={0}
                defaultValue={item.quantity_sent}
                onChange={e => setReceived(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                className="w-20 rounded border border-gray-300 h-8 px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
              <span className="text-xs text-gray-400">received</span>
            </div>
          ))}
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/distributions')} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="rounded-md bg-primary-600 px-6 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {mutation.isPending ? 'Confirming…' : 'Confirm Receipt'}
          </button>
        </div>
      </form>
    )
  }
  ```

- [ ] **Step 6: Write smoke test + update router + Commit**

  ```tsx
  // frontend/src/pages/DistributionsPage.test.tsx
  import { it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { AuthProvider } from '@/contexts/AuthContext'
  import DistributionsPage from './DistributionsPage'

  it('distributions page renders heading', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
    render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter><DistributionsPage /></MemoryRouter></AuthProvider></QueryClientProvider>)
    expect(screen.getByRole('heading', { name: /distributions/i })).toBeInTheDocument()
  })
  ```

  Add to `router.tsx` inside AppLayout children:
  ```tsx
  import DistributionsPage from '@/pages/DistributionsPage'
  import CreateDistributionPage from '@/pages/distributions/CreateDistributionPage'
  import ConfirmDistributionPage from '@/pages/distributions/ConfirmDistributionPage'
  // ...
  { path: 'distributions', element: <DistributionsPage /> },
  { path: 'distributions/new', element: <CreateDistributionPage /> },
  { path: 'distributions/:id/confirm', element: <ConfirmDistributionPage /> },
  ```

  ```bash
  cd frontend && npx vitest run && npx tsc --noEmit
  cd ..
  git add frontend/src/api/distributions.ts frontend/src/api/locations.ts \
          frontend/src/pages/DistributionsPage.tsx frontend/src/pages/distributions/ \
          frontend/src/pages/DistributionsPage.test.tsx frontend/src/router.tsx
  git commit -m "feat(frontend): distribution workflow — list, create form, confirm receipt"
  ```

---

## Task 5: POS / Sales — sale creation with auto price tier, sale list

**Files:**
- Create: `frontend/src/api/sales.ts`
- Create: `frontend/src/api/clients.ts`
- Create: `frontend/src/pages/SalesPage.tsx`
- Create: `frontend/src/pages/sales/NewSalePage.tsx`
- Modify: `frontend/src/router.tsx`
- Test: `frontend/src/pages/SalesPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/sales`, `POST /api/v1/sales`, `GET /api/v1/clients`, `GET /api/v1/products`
- Price tier logic: `quantity >= product.wholesale_threshold` → wholesale price; else → retail price

- [ ] **Step 1: Create `frontend/src/api/sales.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse, ApiResponse } from '@/types'

  export interface Sale {
    id: number
    location_id: number
    sold_by: number
    client_id: number | null
    payment_method: 'nmb' | 'airtel' | 'vodacom' | 'tigo'
    total_amount: string
    discount_amount: string
    is_reverted: boolean
    sale_date: string
  }

  export interface SaleItem {
    product_id: number
    quantity: number
    batch_id?: number
  }

  export interface CreateSalePayload {
    payment_method: 'nmb' | 'airtel' | 'vodacom' | 'tigo'
    sale_date: string
    client_id?: number
    discount_amount?: number
    items: SaleItem[]
  }

  export const salesApi = {
    list: (page = 1) =>
      api.get<PaginatedResponse<Sale>>('/sales', { params: { page } }),
    create: (data: CreateSalePayload) =>
      api.post<ApiResponse<Sale>>('/sales', data),
    revert: (id: number, reason: string) =>
      api.post<ApiResponse<Sale>>(`/sales/${id}/revert`, { reason }),
  }
  ```

- [ ] **Step 2: Create `frontend/src/api/clients.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse, ApiResponse } from '@/types'

  export interface Client {
    id: number
    location_id: number
    name: string
    phone: string | null
    is_active: boolean
  }

  export const clientsApi = {
    list: () => api.get<PaginatedResponse<Client>>('/clients'),
    create: (data: { name: string; phone?: string }) =>
      api.post<ApiResponse<Client>>('/clients', data),
  }
  ```

- [ ] **Step 3: Create `frontend/src/pages/SalesPage.tsx`**

  ```tsx
  import { Link } from 'react-router-dom'
  import { useQuery } from '@tanstack/react-query'
  import { Plus } from 'lucide-react'
  import { salesApi, type Sale } from '@/api/sales'
  import { useAuth } from '@/contexts/AuthContext'
  import DataTable from '@/components/ui/DataTable'
  import Badge from '@/components/ui/Badge'

  const columns = [
    { key: 'id', header: '#', render: (s: Sale) => `#${s.id}` },
    { key: 'sale_date', header: 'Date', render: (s: Sale) => new Date(s.sale_date).toLocaleDateString() },
    { key: 'payment_method', header: 'Payment', render: (s: Sale) => <Badge className="uppercase">{s.payment_method}</Badge> },
    { key: 'total_amount', header: 'Total (TZS)', render: (s: Sale) => Number(s.total_amount).toLocaleString('en-US') },
    { key: 'is_reverted', header: 'Status', render: (s: Sale) => s.is_reverted ? <Badge variant="danger">Reverted</Badge> : <Badge variant="success">Completed</Badge> },
  ]

  export default function SalesPage() {
    const { user } = useAuth()
    const { data, isLoading } = useQuery({ queryKey: ['sales'], queryFn: () => salesApi.list().then(r => r.data) })

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Sales</h1>
          {(user?.role === 'seller' || user?.role === 'admin') && (
            <Link to="/sales/new" className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700">
              <Plus size={16} /> New Sale
            </Link>
          )}
        </div>
        <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No sales yet." />
      </div>
    )
  }
  ```

- [ ] **Step 4: Create `frontend/src/pages/sales/NewSalePage.tsx`**

  ```tsx
  import { useMemo, useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
  import { Plus, Trash2 } from 'lucide-react'
  import { salesApi, type CreateSalePayload } from '@/api/sales'
  import { productsApi, type Product } from '@/api/products'

  const PAYMENT_METHODS = ['nmb', 'airtel', 'vodacom', 'tigo'] as const

  interface LineItem {
    product: Product
    quantity: number
    priceTier: 'wholesale' | 'retail'
    unitPrice: number
    lineTotal: number
  }

  function computeItem(product: Product, quantity: number): LineItem {
    const isWholesale = quantity >= product.wholesale_threshold
    const unitPrice = Number(isWholesale ? product.wholesale_price : product.retail_price)
    return { product, quantity, priceTier: isWholesale ? 'wholesale' : 'retail', unitPrice, lineTotal: unitPrice * quantity }
  }

  export default function NewSalePage() {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>('nmb')
    const [discount, setDiscount] = useState(0)
    const [items, setItems] = useState<LineItem[]>([])
    const [productSearch, setProductSearch] = useState('')
    const [error, setError] = useState<string | null>(null)

    const { data: products } = useQuery({ queryKey: ['products', 'all'], queryFn: () => productsApi.list({ page: 1 }).then(r => r.data.data) })

    const mutation = useMutation({
      mutationFn: (data: CreateSalePayload) => salesApi.create(data),
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales'] }); navigate('/sales') },
      onError: () => setError('Failed to record sale. Please try again.'),
    })

    const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.lineTotal, 0), [items])
    const total = Math.max(0, subtotal - discount)

    const filtered = (products ?? []).filter(p =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) && !items.find(i => i.product.id === p.id)
    )

    const addProduct = (p: Product) => { setItems(prev => [...prev, computeItem(p, 1)]); setProductSearch('') }
    const updateQty = (idx: number, qty: number) => setItems(prev => prev.map((i, j) => j === idx ? computeItem(i.product, qty) : i))

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (items.length === 0) { setError('Add at least one product.'); return }
      mutation.mutate({
        payment_method: paymentMethod,
        sale_date: new Date().toISOString().split('T')[0],
        discount_amount: discount || undefined,
        items: items.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
      })
    }

    return (
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">New Sale</h1>

        {/* Product search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>
          <div className="relative">
            <input type="text" placeholder="Search products to add…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className="block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {productSearch && filtered.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                {filtered.slice(0, 8).map(p => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50">
                    <span className="flex items-center gap-2"><Plus size={14} className="text-primary-600" />{p.name}</span>
                    <span className="text-xs text-gray-400">{Number(p.retail_price).toLocaleString('en-US')} TZS</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Line items */}
          {items.length > 0 && (
            <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-center">Qty</th>
                    <th className="px-4 py-2 text-right">Price</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, idx) => (
                    <tr key={item.product.id}>
                      <td className="px-4 py-2">
                        {item.product.name}
                        <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{item.priceTier}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" min={1} value={item.quantity} onChange={e => updateQty(idx, Number(e.target.value))}
                          className="w-16 rounded border border-gray-300 h-8 px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">{item.unitPrice.toLocaleString('en-US')}</td>
                      <td className="px-4 py-2 text-right font-medium">{item.lineTotal.toLocaleString('en-US')}</td>
                      <td className="px-2"><button type="button" onClick={() => setItems(p => p.filter((_, j) => j !== idx))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payment + discount */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary-600">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Discount (TZS)</label>
            <input type="number" min={0} value={discount} onChange={e => setDiscount(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>
        </div>

        {/* Total */}
        <div className="rounded-lg border border-gray-200 p-4 text-right space-y-1">
          <div className="text-sm text-gray-500">Subtotal: {subtotal.toLocaleString('en-US')} TZS</div>
          {discount > 0 && <div className="text-sm text-gray-500">Discount: -{discount.toLocaleString('en-US')} TZS</div>}
          <div className="text-lg font-semibold text-gray-900">Total: {total.toLocaleString('en-US')} TZS</div>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/sales')} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutation.isPending || items.length === 0}
            className="flex-1 rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {mutation.isPending ? 'Recording…' : `Record Sale — ${total.toLocaleString('en-US')} TZS`}
          </button>
        </div>
      </form>
    )
  }
  ```

- [ ] **Step 5: Write smoke test, update router, commit**

  ```tsx
  // frontend/src/pages/SalesPage.test.tsx
  import { it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { AuthProvider } from '@/contexts/AuthContext'
  import SalesPage from './SalesPage'

  it('sales page renders heading', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
    render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter><SalesPage /></MemoryRouter></AuthProvider></QueryClientProvider>)
    expect(screen.getByRole('heading', { name: /sales/i })).toBeInTheDocument()
  })
  ```

  Add to `router.tsx` inside AppLayout children:
  ```tsx
  import SalesPage from '@/pages/SalesPage'
  import NewSalePage from '@/pages/sales/NewSalePage'
  { path: 'sales', element: <SalesPage /> },
  { path: 'sales/new', element: <NewSalePage /> },
  ```

  ```bash
  cd frontend && npx vitest run && npx tsc --noEmit
  cd ..
  git add frontend/src/api/sales.ts frontend/src/api/clients.ts \
          frontend/src/pages/SalesPage.tsx frontend/src/pages/sales/ \
          frontend/src/pages/SalesPage.test.tsx frontend/src/router.tsx
  git commit -m "feat(frontend): POS — sale creation with auto price tier, payment method, totals"
  ```

---

## Task 6: Purchasing + Admin modules + final merge

**Files:**
- Create: `frontend/src/api/purchases.ts`
- Create: `frontend/src/pages/PurchasesPage.tsx`
- Create: `frontend/src/pages/purchases/NewPurchasePage.tsx`
- Create: `frontend/src/api/users.ts`
- Create: `frontend/src/pages/UsersPage.tsx`
- Modify: `frontend/src/router.tsx` (add all remaining routes)
- Modify: `.superpowers/sdd/progress.md` (mark Phase 7 complete)
- Test: `frontend/src/pages/PurchasesPage.test.tsx`

- [ ] **Step 1: Create `frontend/src/api/purchases.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse, ApiResponse } from '@/types'

  export interface Purchase {
    id: number
    purchased_by: number
    supplier_name: string | null
    invoice_number: string | null
    purchase_date: string
  }

  export interface CreatePurchasePayload {
    purchase_date: string
    supplier_name?: string
    invoice_number?: string
    notes?: string
    items: Array<{
      product_id: number
      quantity: number
      unit_cost: number
      expiry_date?: string
      batch_number?: string
    }>
  }

  export const purchasesApi = {
    list: (page = 1) =>
      api.get<PaginatedResponse<Purchase>>('/purchases', { params: { page } }),
    create: (data: CreatePurchasePayload) =>
      api.post<ApiResponse<Purchase>>('/purchases', data),
  }
  ```

- [ ] **Step 2: Create `frontend/src/api/users.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse, ApiResponse, User } from '@/types'

  export const usersApi = {
    list: (page = 1) =>
      api.get<PaginatedResponse<User>>('/users', { params: { page } }),
    create: (data: { name: string; email: string; password: string; role: string; location_id?: number; is_active?: boolean }) =>
      api.post<ApiResponse<User>>('/users', data),
    update: (id: number, data: Partial<{ name: string; email: string; password: string; role: string; location_id: number | null; is_active: boolean }>) =>
      api.put<ApiResponse<User>>(`/users/${id}`, data),
  }
  ```

- [ ] **Step 3: Create `frontend/src/pages/PurchasesPage.tsx`** (list only — full form in NewPurchasePage)

  ```tsx
  import { Link } from 'react-router-dom'
  import { useQuery } from '@tanstack/react-query'
  import { Plus } from 'lucide-react'
  import { purchasesApi, type Purchase } from '@/api/purchases'
  import { useAuth } from '@/contexts/AuthContext'
  import DataTable from '@/components/ui/DataTable'

  const columns = [
    { key: 'id', header: '#', render: (p: Purchase) => `#${p.id}` },
    { key: 'purchase_date', header: 'Date', render: (p: Purchase) => new Date(p.purchase_date).toLocaleDateString() },
    { key: 'supplier_name', header: 'Supplier', render: (p: Purchase) => p.supplier_name ?? '—' },
    { key: 'invoice_number', header: 'Invoice', render: (p: Purchase) => p.invoice_number ?? '—' },
  ]

  export default function PurchasesPage() {
    const { user } = useAuth()
    const { data, isLoading } = useQuery({ queryKey: ['purchases'], queryFn: () => purchasesApi.list().then(r => r.data) })

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Purchases</h1>
          {(user?.role === 'admin' || user?.role === 'store_keeper') && (
            <Link to="/purchases/new" className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700">
              <Plus size={16} /> Record Purchase
            </Link>
          )}
        </div>
        <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No purchases recorded." />
      </div>
    )
  }
  ```

- [ ] **Step 4: Create `frontend/src/pages/purchases/NewPurchasePage.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
  import { Plus, Trash2 } from 'lucide-react'
  import { purchasesApi, type CreatePurchasePayload } from '@/api/purchases'
  import { productsApi, type Product } from '@/api/products'

  interface LineItem {
    product: Product
    quantity: number
    unit_cost: number
    expiry_date: string
    batch_number: string
  }

  export default function NewPurchasePage() {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const [supplierName, setSupplierName] = useState('')
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [items, setItems] = useState<LineItem[]>([])
    const [productSearch, setProductSearch] = useState('')
    const [error, setError] = useState<string | null>(null)

    const { data: products } = useQuery({ queryKey: ['products', 'all'], queryFn: () => productsApi.list({ page: 1 }).then(r => r.data.data) })

    const mutation = useMutation({
      mutationFn: (data: CreatePurchasePayload) => purchasesApi.create(data),
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); navigate('/purchases') },
      onError: () => setError('Failed to record purchase.'),
    })

    const filtered = (products ?? []).filter(p =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) && !items.find(i => i.product.id === p.id)
    )

    const addProduct = (p: Product) => {
      setItems(prev => [...prev, { product: p, quantity: 1, unit_cost: Number(p.latest_cost), expiry_date: '', batch_number: '' }])
      setProductSearch('')
    }

    const updateItem = (idx: number, field: keyof LineItem, value: string | number) =>
      setItems(prev => prev.map((i, j) => j === idx ? { ...i, [field]: value } : i))

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (items.length === 0) { setError('Add at least one product.'); return }
      mutation.mutate({
        purchase_date: new Date().toISOString().split('T')[0],
        supplier_name: supplierName || undefined,
        invoice_number: invoiceNumber || undefined,
        items: items.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          expiry_date: i.expiry_date || undefined,
          batch_number: i.batch_number || undefined,
        })),
      })
    }

    return (
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">Record Purchase</h1>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Supplier Name</label>
            <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Invoice Number</label>
            <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Products Purchased</label>
          <div className="relative">
            <input type="text" placeholder="Search products…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className="block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {productSearch && filtered.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                {filtered.slice(0, 8).map(p => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50">
                    <Plus size={14} className="text-primary-600" /> {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="mt-3 space-y-3">
              {items.map((item, idx) => (
                <div key={item.product.id} className="rounded-md border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.product.name}</span>
                    <button type="button" onClick={() => setItems(p => p.filter((_, j) => j !== idx))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <label className="text-gray-500">Qty</label>
                      <input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                        className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
                    </div>
                    <div>
                      <label className="text-gray-500">Cost (TZS)</label>
                      <input type="number" min={0} value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', Number(e.target.value))}
                        className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
                    </div>
                    <div>
                      <label className="text-gray-500">Batch #</label>
                      <input type="text" value={item.batch_number} onChange={e => updateItem(idx, 'batch_number', e.target.value)}
                        className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
                    </div>
                    <div>
                      <label className="text-gray-500">Expiry</label>
                      <input type="date" value={item.expiry_date} onChange={e => updateItem(idx, 'expiry_date', e.target.value)}
                        className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/purchases')} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="rounded-md bg-primary-600 px-6 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {mutation.isPending ? 'Recording…' : 'Record Purchase'}
          </button>
        </div>
      </form>
    )
  }
  ```

- [ ] **Step 5: Create `frontend/src/pages/UsersPage.tsx`** (admin only)

  ```tsx
  import { useQuery } from '@tanstack/react-query'
  import { usersApi } from '@/api/users'
  import DataTable from '@/components/ui/DataTable'
  import Badge from '@/components/ui/Badge'
  import type { User } from '@/types'

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (u: User) => <Badge>{u.role.replace('_', ' ')}</Badge> },
    { key: 'is_active', header: 'Status', render: (u: User) => <Badge variant={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Active' : 'Inactive'}</Badge> },
  ]

  export default function UsersPage() {
    const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list().then(r => r.data) })

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
        <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No users found." />
      </div>
    )
  }
  ```

- [ ] **Step 6: Write test + complete router + update ledger + merge**

  ```tsx
  // frontend/src/pages/PurchasesPage.test.tsx
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
  ```

  Final `router.tsx` (complete AppLayout children list):
  ```tsx
  import PurchasesPage from '@/pages/PurchasesPage'
  import NewPurchasePage from '@/pages/purchases/NewPurchasePage'
  import UsersPage from '@/pages/UsersPage'
  // all others already imported in previous tasks...
  { path: 'purchases', element: <PurchasesPage /> },
  { path: 'purchases/new', element: <NewPurchasePage /> },
  { path: 'users', element: <UsersPage /> },
  ```

  ```bash
  cd frontend && npx vitest run && npx tsc --noEmit
  cd ..
  git add frontend/src/api/purchases.ts frontend/src/api/users.ts \
          frontend/src/pages/PurchasesPage.tsx frontend/src/pages/purchases/ \
          frontend/src/pages/UsersPage.tsx \
          frontend/src/pages/PurchasesPage.test.tsx \
          frontend/src/router.tsx .superpowers/sdd/progress.md
  git commit -m "feat(frontend): purchasing form, user management — Phase 7 complete"
  git checkout master
  git merge --no-ff feature/phase-7-frontend \
      -m "feat: complete Phase 7 — React SPA wired to API (auth, dashboard, products, stock, distribution, POS, purchasing)"
  ```

---

## Self-Review

**Spec coverage:**

| Screen | Task |
|---|---|
| Login form (email/password) | 1 |
| Auth state (localStorage, AuthContext) | 1 |
| Protected routes (unauthenticated → /login) | 1 |
| Role-based nav links in sidebar | 1 |
| User name + logout in header | 1 |
| Dashboard — admin KPIs | 2 |
| Dashboard — store_keeper KPIs | 2 |
| Dashboard — seller daily stats | 2 |
| News feed on dashboard | 2 |
| Product list with search + pagination | 3 |
| Current stock view | 3 |
| Expiry alerts tab | 3 |
| Low stock alerts tab | 3 |
| Distribution list with status badges | 4 |
| Create distribution (store_keeper) | 4 |
| Confirm distribution (seller) | 4 |
| Sale list | 5 |
| New sale form with auto price tier | 5 |
| Purchase list | 6 |
| Record purchase with batch/expiry | 6 |
| User management (admin) | 6 |

**Deferred to v1.1 (post-launch):** Reconciliation form, Attendance clock-in/out, Expenses page, P&L report UI, Sale revert admin action, Product create/edit form, Full news management UI.

**Placeholder scan:** All code blocks complete. No TBD patterns.

**Type consistency:**
- `useAuth()` returns `{ user: User|null, isAuthenticated: boolean, login, logout }` — consistent across all tasks.
- `DataTable<T extends { id: number }>` — all data types (Product, Sale, Distribution, Purchase, User) have `id: number`. ✅
- `Badge variant` prop — values `default|primary|success|warning|danger|info` defined in Task 2. Consistent usage in Tasks 3–6.
- API response types (`PaginatedResponse<T>`, `ApiResponse<T>`) from `src/types/index.ts` — imported consistently.
