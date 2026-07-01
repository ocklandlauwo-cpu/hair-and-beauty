# Phase 12 — Client Selector on Sales + Session Timeout + Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the optional client field to the POS sale form (backend already supports it), implement a 30-minute idle session timeout with a 5-minute warning modal, and delete the debug test artifact.

**Architecture:** Task 1 is a frontend-only addition — `clientsApi.list()` already exists and `CreateSalePayload` already has `client_id?: number`; the sales form just needs a dropdown wired to it. Task 2 is a new `useIdleTimer` hook that listens to DOM events, with the AppLayout consuming it to show a warning modal and auto-logout. Task 3 is a single file deletion.

**Tech Stack:** React 19, TypeScript 5.9, TanStack Query v5, Vitest 4, Tailwind CSS v4.

## Global Constraints

- PHP binary: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe`
- Frontend tests: `cd frontend && npx vitest run` (PowerShell)
- Backend tests: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan test` from `backend/`
- TypeScript check: `cd frontend && npx tsc --noEmit` (PowerShell)
- Authorization: `user?.role === 'admin'` in React — NOT role guards on client or session logic
- Tailwind CSS v4 CSS-first (no tailwind.config.js), token classes: `primary-600`, `primary-700`, etc.
- Control height: `h-10`; input className pattern: `"mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"`
- TanStack Query v5: `enabled: false` in test QueryClient `defaultOptions` to suppress query fetches
- Test mocking: `vi.mock('@/api/clients', () => ({ clientsApi: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) } }))` pattern
- Icons: `lucide-react` only (`AlertTriangle` for the warning modal)
- Session timeout: 30 minutes (1 800 000 ms); warn at 25 minutes (1 500 000 ms)
- `authApi.logout()` from `@/api/auth` — call in onTimeout before clearing localStorage
- `useIdleTimer` hook idle events: `['mousemove', 'keydown', 'mousedown', 'touchstart']`

---

## File Map

**Task 1 — Client selector on NewSalePage:**
- Modify: `frontend/src/pages/sales/NewSalePage.tsx` — add client select + qty aria-label
- Create: `frontend/src/pages/sales/NewSalePage.test.tsx` — heading + client label test

**Task 2 — Session timeout:**
- Create: `frontend/src/hooks/useIdleTimer.ts` — generic idle timer hook
- Create: `frontend/src/hooks/useIdleTimer.test.ts` — unit tests for the hook
- Modify: `frontend/src/components/layout/AppLayout.tsx` — consume hook, render warning modal
- Modify: `frontend/src/components/layout/AppLayout.test.tsx` — add second test for warning visibility

**Task 3 — Cleanup:**
- Delete: `backend/tests/Feature/Api/TempDebugTest.php`

---

## Task 1: Optional Client Selector on NewSalePage

**Files:**
- Modify: `frontend/src/pages/sales/NewSalePage.tsx`
- Create: `frontend/src/pages/sales/NewSalePage.test.tsx`

**Interfaces:**
- Consumes: `clientsApi.list()` → `Promise<AxiosResponse<PaginatedResponse<Client>>>` (from `@/api/clients`)
- Consumes: `CreateSalePayload.client_id?: number` (already typed in `@/api/sales`)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/sales/NewSalePage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import NewSalePage from './NewSalePage'
import { AuthProvider } from '@/contexts/AuthContext'

vi.mock('@/api/products', () => ({
  productsApi: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}))
vi.mock('@/api/clients', () => ({
  clientsApi: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}))

describe('NewSalePage', () => {
  const setup = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
    return render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <NewSalePage />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>
    )
  }

  it('renders heading and client selector', () => {
    setup()
    expect(screen.getByRole('heading', { name: /new sale/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/client/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — confirm it fails**

```powershell
cd frontend; npx vitest run src/pages/sales/NewSalePage.test.tsx
```

Expected: FAIL — `getByLabelText(/client/i)` finds nothing (client select doesn't exist yet)

- [ ] **Step 3: Replace `frontend/src/pages/sales/NewSalePage.tsx` with the updated version**

```tsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { salesApi, type CreateSalePayload } from '@/api/sales'
import { productsApi, type Product } from '@/api/products'
import { clientsApi } from '@/api/clients'

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
  const [clientId, setClientId] = useState<number | ''>('')
  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list({ page: 1 }).then(r => r.data.data),
  })
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list().then(r => r.data.data),
  })

  const mutation = useMutation({
    mutationFn: (data: CreateSalePayload) => salesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-expiry'] })
      qc.invalidateQueries({ queryKey: ['stock-low'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/sales')
    },
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
      client_id: clientId || undefined,
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
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => updateQty(idx, Number(e.target.value))}
                        aria-label={`Quantity for ${item.product.name}`}
                        className="w-16 rounded border border-gray-300 h-8 px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{item.unitPrice.toLocaleString('en-US')}</td>
                    <td className="px-4 py-2 text-right font-medium">{item.lineTotal.toLocaleString('en-US')}</td>
                    <td className="px-2">
                      <button
                        type="button"
                        onClick={() => setItems(p => p.filter((_, j) => j !== idx))}
                        className="text-gray-300 hover:text-red-500"
                        aria-label={`Remove ${item.product.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Client (optional) */}
      <div>
        <label htmlFor="sale-client" className="block text-sm font-medium text-gray-700">
          Client <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <select
          id="sale-client"
          value={clientId}
          onChange={e => setClientId(e.target.value === '' ? '' : Number(e.target.value))}
          className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
        >
          <option value="">— No client —</option>
          {(clients ?? []).map(c => (
            <option key={c.id} value={c.id}>
              {c.name}{c.phone ? ` (${c.phone})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Payment + discount */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sale-payment" className="block text-sm font-medium text-gray-700">Payment Method</label>
          <select id="sale-payment" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}
            className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary-600">
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sale-discount" className="block text-sm font-medium text-gray-700">Discount (TZS)</label>
          <input id="sale-discount" type="number" min={0} value={discount} onChange={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); setDiscount(isNaN(v) ? 0 : v) }}
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

- [ ] **Step 4: Run test — confirm it passes**

```powershell
cd frontend; npx vitest run src/pages/sales/NewSalePage.test.tsx
```

Expected: PASS (1 test)

- [ ] **Step 5: TypeScript check**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Run full frontend suite**

```powershell
cd frontend; npx vitest run
```

Expected: 24 tests pass (was 23, +1 new)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/NewSalePage.tsx frontend/src/pages/sales/NewSalePage.test.tsx
git commit -m "feat(sales): optional client selector on new sale form; aria-label on qty input"
```

---

## Task 2: Session Timeout (30 min idle → warning → auto-logout)

**Files:**
- Create: `frontend/src/hooks/useIdleTimer.ts`
- Create: `frontend/src/hooks/useIdleTimer.test.ts`
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Modify: `frontend/src/components/layout/AppLayout.test.tsx`

**Interfaces:**
- Consumes: `authApi.logout()` from `@/api/auth` (already exists)
- Consumes: `useAuth().logout` from `@/contexts/AuthContext` (already exists)
- Produces: `useIdleTimer(onWarn, onTimeout, timeoutMs?, warnAt?) → { reset: () => void }`

- [ ] **Step 1: Create `frontend/src/hooks/useIdleTimer.ts`**

```ts
import { useCallback, useEffect, useRef } from 'react'

const IDLE_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart'] as const

export function useIdleTimer(
  onWarn: () => void,
  onTimeout: () => void,
  timeoutMs = 30 * 60 * 1000,
  warnAt = 25 * 60 * 1000,
): { reset: () => void } {
  const warnRef = useRef<ReturnType<typeof setTimeout>>()
  const logoutRef = useRef<ReturnType<typeof setTimeout>>()

  const reset = useCallback(() => {
    clearTimeout(warnRef.current)
    clearTimeout(logoutRef.current)
    warnRef.current = setTimeout(onWarn, warnAt)
    logoutRef.current = setTimeout(onTimeout, timeoutMs)
  }, [onWarn, onTimeout, warnAt, timeoutMs])

  useEffect(() => {
    reset()
    IDLE_EVENTS.forEach(e => document.addEventListener(e, reset, { passive: true }))
    return () => {
      clearTimeout(warnRef.current)
      clearTimeout(logoutRef.current)
      IDLE_EVENTS.forEach(e => document.removeEventListener(e, reset))
    }
  }, [reset])

  return { reset }
}
```

- [ ] **Step 2: Write the hook unit tests**

Create `frontend/src/hooks/useIdleTimer.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useIdleTimer } from './useIdleTimer'

describe('useIdleTimer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('calls onWarn at warnAt and onTimeout at timeoutMs', () => {
    const onWarn = vi.fn()
    const onTimeout = vi.fn()
    renderHook(() => useIdleTimer(onWarn, onTimeout, 300, 200))

    act(() => { vi.advanceTimersByTime(200) })
    expect(onWarn).toHaveBeenCalledOnce()
    expect(onTimeout).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(100) })
    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('reset() restarts both timers', () => {
    const onWarn = vi.fn()
    const onTimeout = vi.fn()
    const { result } = renderHook(() => useIdleTimer(onWarn, onTimeout, 300, 200))

    act(() => { vi.advanceTimersByTime(150) })
    act(() => { result.current.reset() })
    act(() => { vi.advanceTimersByTime(150) })

    expect(onWarn).not.toHaveBeenCalled()
    expect(onTimeout).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(200) })
    expect(onWarn).toHaveBeenCalledOnce()
  })

  it('cleans up timers and event listeners on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const onWarn = vi.fn()
    const onTimeout = vi.fn()
    const { unmount } = renderHook(() => useIdleTimer(onWarn, onTimeout, 300, 200))

    unmount()

    act(() => { vi.advanceTimersByTime(300) })
    expect(onWarn).not.toHaveBeenCalled()
    expect(onTimeout).not.toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run hook tests — confirm they pass**

```powershell
cd frontend; npx vitest run src/hooks/useIdleTimer.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 4: Write the failing AppLayout test**

Modify `frontend/src/components/layout/AppLayout.test.tsx` — add a second `it` block:

```tsx
import { it, vi, expect, describe } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import AppLayout from './AppLayout'

// Prevent the real idle timer from running in tests
vi.mock('@/hooks/useIdleTimer', () => ({
  useIdleTimer: vi.fn().mockReturnValue({ reset: vi.fn() }),
}))

function makeRouter() {
  return createMemoryRouter(
    [{ path: '/', element: <AppLayout />, children: [{ index: true, element: <div>content</div> }] }],
    { initialEntries: ['/'] },
  )
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <RouterProvider router={makeRouter()} />
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('AppLayout', () => {
  it('renders sidebar and main content area', () => {
    setup()
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByText('Hair & Beauty')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('does not show session warning on initial render', () => {
    setup()
    expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument()
  })
})
```

**Note:** The existing test is restructured — it now uses a `describe` block and a `setup()` helper. The `vi.mock('@/hooks/useIdleTimer')` prevents real timers from firing during tests. The test is semantically equivalent to the original.

- [ ] **Step 5: Run AppLayout test — confirm 2nd test fails (warning element doesn't exist yet — passes, since AppLayout doesn't render it yet)**

```powershell
cd frontend; npx vitest run src/components/layout/AppLayout.test.tsx
```

Expected: PASS on first test, PASS on second test too — because the warning is not rendered in the current AppLayout. This confirms the test is valid and will catch regressions if the warning ever renders unexpectedly.

- [ ] **Step 6: Replace `frontend/src/components/layout/AppLayout.tsx` with the session-timeout version**

```tsx
import { useState, useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/api/auth'
import { useIdleTimer } from '@/hooks/useIdleTimer'
import Header from './Header'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [showWarning, setShowWarning] = useState(false)

  const onWarn = useCallback(() => setShowWarning(true), [])

  const onTimeout = useCallback(async () => {
    setShowWarning(false)
    try { await authApi.logout() } catch { /* ignore — token may already be invalid */ }
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const { reset } = useIdleTimer(onWarn, onTimeout)

  const handleStayLoggedIn = () => {
    setShowWarning(false)
    reset()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} className="text-amber-500 shrink-0" />
              <h2 className="text-base font-semibold text-gray-900">Session Expiring Soon</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              You've been inactive for a while. You'll be signed out in 5 minutes unless you continue.
            </p>
            <button
              onClick={handleStayLoggedIn}
              className="w-full rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700"
            >
              Stay Logged In
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Run AppLayout tests — confirm both pass**

```powershell
cd frontend; npx vitest run src/components/layout/AppLayout.test.tsx
```

Expected: PASS (2 tests — both descriptions)

- [ ] **Step 8: TypeScript check**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 9: Run full frontend suite**

```powershell
cd frontend; npx vitest run
```

Expected: 27 tests pass (was 24 after Task 1, +3 new: 2 hook tests + 1 new AppLayout test)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/hooks/useIdleTimer.ts frontend/src/hooks/useIdleTimer.test.ts frontend/src/components/layout/AppLayout.tsx frontend/src/components/layout/AppLayout.test.tsx
git commit -m "feat: 30-min idle session timeout with warning modal (useIdleTimer hook + AppLayout)"
```

---

## Task 3: Remove Debug Test File

**Files:**
- Delete: `backend/tests/Feature/Api/TempDebugTest.php`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Delete the file**

```bash
git rm backend/tests/Feature/Api/TempDebugTest.php
```

- [ ] **Step 2: Run backend tests — confirm count unchanged**

```powershell
cd backend; C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan test 2>&1 | Select-Object -Last 4
```

Expected: 115 passed (the debug test was not counted in the suite since it uses `dump()` — confirm count is still 115, not 114)

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove TempDebugTest.php debug artifact"
```

---

## Self-Review

**Spec coverage:**
- Optional client attachment to sales: ✓ Task 1 — `client_id` in form + payload
- Session timeout (30 min inactivity): ✓ Task 2 — `useIdleTimer` with 1 800 000 ms + warn at 1 500 000 ms
- 5-minute warning before logout: ✓ Task 2 — `showWarning` modal, `reset()` on "Stay Logged In"
- Auto-logout calls API then clears localStorage: ✓ Task 2 — `authApi.logout()` in `onTimeout` + `logout()` + `navigate('/login')`
- Debug test removal: ✓ Task 3
- qty aria-label: ✓ Task 1 — added to the quantity `<input>` in the items table

**Placeholder scan:** No TBD/TODO/placeholder found. All code is complete.

**Type consistency:**
- `useIdleTimer(onWarn, onTimeout, timeoutMs, warnAt)` defined in Task 2 Step 1 → consumed in AppLayout Task 2 Step 6 as `useIdleTimer(onWarn, onTimeout)` (using defaults) ✓
- `{ reset: () => void }` returned from hook → consumed as `const { reset } = useIdleTimer(...)` in AppLayout ✓
- `clientsApi.list()` returns `PaginatedResponse<Client>` → `.then(r => r.data.data)` gives `Client[]` ✓
- `clientId: number | ''` → `clientId || undefined` produces `number | undefined` matching `CreateSalePayload.client_id?: number` ✓
- Test count progression: 23 → 24 (Task 1 +1) → 27 (Task 2 +3) ✓
