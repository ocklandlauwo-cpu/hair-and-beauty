# Phase 8: Pre-Launch Hardening — Security, Missing Pages & UX Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three remaining daily-operations gaps (reconciliation, attendance, expenses/P&L) and apply five pre-launch hardening items (login rate-limit, stock view RLS fix, cache invalidation, NaN guards, TypeScript cleanup) before the August 1 go-live.

**Architecture:** Task 1 hardens the backend (throttle + view security). Tasks 2–4 add the three missing frontend pages following the established pattern (API client → page component → router entry → smoke test). Task 5 applies a batch of UX/TypeScript polish across existing files — no new pages, only targeted edits.

**Tech Stack:** PHP 8.4 / Laravel 12 (backend); React 19 / TypeScript 5.9 / TanStack Query 5 (frontend)

## Global Constraints

- PHP binary: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe`; all backend commands from `backend/`
- Node commands from `frontend/`; `npx vitest run`; `npx tsc --noEmit`
- Expense categories exactly: `salary`, `security`, `electricity`, `cleanliness`, `rent`, `transport`
- Payment methods exactly: `nmb`, `airtel`, `vodacom`, `tigo`
- All icons from `lucide-react`; brand: `bg-primary-600` buttons, `bg-primary-900` sidebar
- `useAuth()` from `@/contexts/AuthContext`; `Badge` from `@/components/ui/Badge`; `DataTable` from `@/components/ui/DataTable`
- Auth guard: `RoleRoute` component; routes nested under `ProtectedRoute → AppLayout`
- All Vitest tests: `globals: false`; import `{ describe, it, expect }` from `'vitest'`; `vi.mock` for API-backed tests
- Pint on every backend file before committing; PHPStan after backend changes

---

## Task 1: Backend security — login throttle + stock views with `security_invoker`

**Files:**
- Modify: `backend/routes/api.php` (add throttle to login)
- Create: `backend/database/migrations/..._fix_stock_views_security_invoker.php`
- Test: `backend/tests/Feature/Auth/LoginThrottleTest.php`

**Why:** `POST /login` is currently unthrottled — brute-force risk. The three stock views (`v_current_stock`, `v_expiry_alerts`, `v_low_stock_alerts`) are owned by `hairbeauty_owner` (BYPASSRLS) and do not carry `security_invoker=true`, meaning RLS is not enforced when `hairbeauty_app` queries them through the view. Adding `security_invoker` forces PostgreSQL to evaluate RLS as the querying role, not the view owner.

- [ ] **Step 1: Write failing throttle test in `backend/tests/Feature/Auth/LoginThrottleTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\RateLimiter;

  beforeEach(function () {
      RateLimiter::clear('login');
  });

  it('blocks login after 5 failed attempts within 1 minute', function () {
      User::factory()->create(['email' => 'throttle@test.com']);

      for ($i = 0; $i < 5; $i++) {
          $this->postJson('/api/v1/auth/login', [
              'email'    => 'throttle@test.com',
              'password' => 'wrong',
          ]);
      }

      $this->postJson('/api/v1/auth/login', [
          'email'    => 'throttle@test.com',
          'password' => 'wrong',
      ])->assertStatus(429);
  });
  ```

- [ ] **Step 2: Run test — expect FAIL (no throttle yet)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Auth/LoginThrottleTest.php
  ```

  Expected: FAIL — 422 instead of 429 on the 6th request.

- [ ] **Step 3: Add throttle middleware to login route in `backend/routes/api.php`**

  Change the login route to:
  ```php
  Route::post('/login', LoginController::class)
      ->middleware('throttle:5,1')
      ->name('login');
  ```

- [ ] **Step 4: Run test — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Auth/LoginThrottleTest.php
  ```

- [ ] **Step 5: Create security_invoker migration for stock views**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration fix_stock_views_security_invoker
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Support\Facades\DB;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          // Drop dependent view first
          DB::statement('DROP VIEW IF EXISTS v_low_stock_alerts');
          DB::statement('DROP VIEW IF EXISTS v_expiry_alerts');
          DB::statement('DROP VIEW IF EXISTS v_current_stock');

          // Recreate with security_invoker=true so RLS is enforced as the querying role
          DB::statement("
              CREATE VIEW v_current_stock
              WITH (security_invoker = true) AS
              SELECT
                  p.id              AS product_id,
                  p.name            AS product_name,
                  p.sku,
                  p.unit,
                  p.latest_cost,
                  p.wholesale_price,
                  p.retail_price,
                  p.wholesale_threshold,
                  l.id              AS location_id,
                  l.name            AS location_name,
                  l.type            AS location_type,
                  COALESCE(SUM(sm.quantity), 0)::INTEGER AS current_stock
              FROM products p
              CROSS JOIN locations l
              LEFT JOIN stock_movements sm
                  ON sm.product_id = p.id AND sm.location_id = l.id
              WHERE p.is_active = true AND l.is_active = true
              GROUP BY p.id, p.name, p.sku, p.unit, p.latest_cost,
                       p.wholesale_price, p.retail_price, p.wholesale_threshold,
                       l.id, l.name, l.type;
          ");

          DB::statement("
              CREATE VIEW v_expiry_alerts
              WITH (security_invoker = true) AS
              SELECT
                  b.id             AS batch_id,
                  b.product_id,
                  p.name           AS product_name,
                  b.batch_number,
                  b.expiry_date,
                  (b.expiry_date - CURRENT_DATE)::INTEGER AS days_until_expiry
              FROM batches b
              JOIN products p ON p.id = b.product_id
              WHERE b.expiry_date IS NOT NULL
                AND b.expiry_date > CURRENT_DATE
                AND b.expiry_date <= CURRENT_DATE + INTERVAL '60 days'
                AND p.is_active = true;
          ");

          DB::statement("
              CREATE VIEW v_low_stock_alerts
              WITH (security_invoker = true) AS
              WITH avg_sales AS (
                  SELECT
                      si.product_id,
                      s.location_id,
                      SUM(si.quantity)::DECIMAL / 90 AS avg_daily
                  FROM sale_items si
                  JOIN sales s ON s.id = si.sale_id
                  WHERE s.sale_date >= CURRENT_DATE - 90
                    AND s.is_reverted = false
                  GROUP BY si.product_id, s.location_id
              )
              SELECT
                  cs.product_id,
                  cs.product_name,
                  cs.location_id,
                  cs.location_name,
                  cs.location_type,
                  cs.current_stock,
                  ROUND(COALESCE(av.avg_daily, 0), 2) AS avg_daily_sales,
                  CASE
                      WHEN COALESCE(av.avg_daily, 0) = 0 THEN NULL
                      ELSE (cs.current_stock / av.avg_daily)::INTEGER
                  END AS days_of_cover
              FROM v_current_stock cs
              LEFT JOIN avg_sales av
                  ON av.product_id = cs.product_id AND av.location_id = cs.location_id
              WHERE COALESCE(av.avg_daily, 0) > 0
                AND (cs.current_stock / av.avg_daily) <= 30;
          ");
      }

      public function down(): void
      {
          DB::statement('DROP VIEW IF EXISTS v_low_stock_alerts');
          DB::statement('DROP VIEW IF EXISTS v_expiry_alerts');
          DB::statement('DROP VIEW IF EXISTS v_current_stock');
          // Note: views without security_invoker are recreated by the previous create_stock_views migration
      }
  };
  ```

- [ ] **Step 6: Run migrations**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  ```

  Expected: `fix_stock_views_security_invoker ... DONE`

- [ ] **Step 7: Run full backend suite + PHPStan + Pint**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint routes/api.php database/migrations
  ```

- [ ] **Step 8: Commit**

  ```bash
  cd ..
  git add backend/routes/api.php \
          backend/database/migrations/*fix_stock_views* \
          backend/tests/Feature/Auth/LoginThrottleTest.php
  git commit -m "fix(security): login throttle 5/min; recreate stock views with security_invoker=true"
  ```

---

## Task 2: Frontend — Reconciliation page (seller daily)

**Files:**
- Create: `frontend/src/api/reconciliations.ts`
- Create: `frontend/src/pages/ReconciliationPage.tsx`
- Modify: `frontend/src/router.tsx` (add /reconciliations under RoleRoute seller+admin)
- Modify: `frontend/src/components/layout/Sidebar.tsx` (add Reconciliation link for seller)
- Test: `frontend/src/pages/ReconciliationPage.test.tsx`

**Business rule:** A seller submits one reconciliation per shop per day. The form should show a `"Already submitted today"` state if one already exists for today's date + the seller's location.

- [ ] **Step 1: Create `frontend/src/api/reconciliations.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse, ApiResponse } from '@/types'

  export interface Reconciliation {
    id: number
    location_id: number
    seller_id: number
    reconciliation_date: string
    total_sold_amount: string
    receipt_path: string | null
    notes: string | null
    verified_by: number | null
    verified_at: string | null
  }

  export interface CreateReconciliationPayload {
    reconciliation_date: string
    total_sold_amount: number
    notes?: string
  }

  export const reconciliationsApi = {
    list: (page = 1) =>
      api.get<PaginatedResponse<Reconciliation>>('/reconciliations', { params: { page } }),
    create: (data: CreateReconciliationPayload) =>
      api.post<ApiResponse<Reconciliation>>('/reconciliations', data),
  }
  ```

- [ ] **Step 2: Create `frontend/src/pages/ReconciliationPage.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { CheckCircle } from 'lucide-react'
  import { reconciliationsApi, type Reconciliation } from '@/api/reconciliations'
  import DataTable from '@/components/ui/DataTable'
  import Badge from '@/components/ui/Badge'

  const today = new Date().toISOString().split('T')[0]

  const columns = [
    { key: 'reconciliation_date', header: 'Date' },
    { key: 'total_sold_amount', header: 'Total Sold (TZS)', render: (r: Reconciliation) => Number(r.total_sold_amount).toLocaleString('en-US') },
    { key: 'notes', header: 'Notes', render: (r: Reconciliation) => r.notes ?? '—' },
    { key: 'verified_by', header: 'Status', render: (r: Reconciliation) => r.verified_by ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Pending verification</Badge> },
  ]

  export default function ReconciliationPage() {
    const qc = useQueryClient()
    const [amount, setAmount] = useState('')
    const [notes, setNotes] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const { data, isLoading } = useQuery({
      queryKey: ['reconciliations'],
      queryFn: () => reconciliationsApi.list().then(r => r.data),
    })

    const alreadySubmittedToday = data?.data.some(r => r.reconciliation_date === today) ?? false

    const mutation = useMutation({
      mutationFn: reconciliationsApi.create,
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['reconciliations'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        setAmount('')
        setNotes('')
        setError(null)
        setSuccess(true)
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        setError(msg ?? 'Failed to submit reconciliation.')
        setSuccess(false)
      },
    })

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      const parsedAmount = Number(amount)
      if (!amount || isNaN(parsedAmount) || parsedAmount < 0) {
        setError('Enter a valid total amount (≥ 0).')
        return
      }
      setError(null)
      mutation.mutate({ reconciliation_date: today, total_sold_amount: parsedAmount, notes: notes || undefined })
    }

    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">Daily Reconciliation</h1>

        {/* Submit form */}
        {!alreadySubmittedToday ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 max-w-md">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Submit for {today}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="recon-amount" className="block text-sm font-medium text-gray-700">
                  Total Sold Today (TZS)
                </label>
                <input
                  id="recon-amount"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 350000"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
                />
              </div>
              <div>
                <label htmlFor="recon-notes" className="block text-sm font-medium text-gray-700">
                  Notes (optional)
                </label>
                <textarea
                  id="recon-notes"
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
                />
              </div>
              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              {success && (
                <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  <CheckCircle size={14} /> Reconciliation submitted successfully.
                </p>
              )}
              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {mutation.isPending ? 'Submitting…' : 'Submit Reconciliation'}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 max-w-md">
            <CheckCircle size={18} className="text-green-600" />
            <p className="text-sm text-green-800 font-medium">Today's reconciliation has been submitted.</p>
          </div>
        )}

        {/* History */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Reconciliation History</h2>
          <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No reconciliations yet." />
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3: Write smoke test in `frontend/src/pages/ReconciliationPage.test.tsx`**

  ```tsx
  import { it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { AuthProvider } from '@/contexts/AuthContext'
  import ReconciliationPage from './ReconciliationPage'

  it('reconciliation page renders heading and form', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
    render(
      <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
        <ReconciliationPage />
      </MemoryRouter></AuthProvider></QueryClientProvider>
    )
    expect(screen.getByRole('heading', { name: /daily reconciliation/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/total sold today/i)).toBeInTheDocument()
  })
  ```

- [ ] **Step 4: Update sidebar + router**

  In `frontend/src/components/layout/Sidebar.tsx`, add to `allLinks` (after Sales):
  ```tsx
  { to: '/reconciliations', label: 'Reconciliation', icon: ClipboardCheck, roles: ['admin', 'store_keeper', 'seller'] as const },
  ```
  Import `ClipboardCheck` from `lucide-react`.

  In `frontend/src/router.tsx`, add inside the `RoleRoute allow=['admin','seller']` group (or a new group):
  ```tsx
  import ReconciliationPage from '@/pages/ReconciliationPage'
  // Add to AppLayout children:
  { path: 'reconciliations', element: <ReconciliationPage /> },
  ```
  Since all roles can view, put it in the flat ungated section.

- [ ] **Step 5: Run tests + tsc + Commit**

  ```bash
  cd frontend
  npx vitest run
  npx tsc --noEmit
  cd ..
  git add frontend/src/api/reconciliations.ts \
          frontend/src/pages/ReconciliationPage.tsx \
          frontend/src/pages/ReconciliationPage.test.tsx \
          frontend/src/components/layout/Sidebar.tsx \
          frontend/src/router.tsx
  git commit -m "feat(frontend): daily reconciliation form + history list"
  ```

---

## Task 3: Frontend — Attendance clock-in/out (geofenced)

**Files:**
- Create: `frontend/src/api/attendance.ts`
- Create: `frontend/src/pages/AttendancePage.tsx`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Test: `frontend/src/pages/AttendancePage.test.tsx`

**Business rule:** Seller clicks Clock In or Clock Out. The browser's Geolocation API provides lat/lng. The backend returns `is_within_geofence` and `distance_m` — display both to the seller. Show the last action recorded today.

- [ ] **Step 1: Create `frontend/src/api/attendance.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse, ApiResponse } from '@/types'

  export interface AttendanceRecord {
    id: number
    user_id: number
    location_id: number
    action: 'clock_in' | 'clock_out'
    latitude: string
    longitude: string
    is_within_geofence: boolean
    recorded_at: string
  }

  export interface ClockPayload {
    action: 'clock_in' | 'clock_out'
    latitude: number
    longitude: number
  }

  export interface ClockResponse {
    id: number
    action: 'clock_in' | 'clock_out'
    is_within_geofence: boolean
    distance_m: number | null
    recorded_at: string
  }

  export const attendanceApi = {
    list: (page = 1) =>
      api.get<PaginatedResponse<AttendanceRecord>>('/attendance', { params: { page } }),
    clock: (data: ClockPayload) =>
      api.post<ApiResponse<ClockResponse>>('/attendance', data),
  }
  ```

- [ ] **Step 2: Create `frontend/src/pages/AttendancePage.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { LogIn, LogOut, MapPin, AlertCircle } from 'lucide-react'
  import { attendanceApi, type AttendanceRecord } from '@/api/attendance'
  import DataTable from '@/components/ui/DataTable'
  import Badge from '@/components/ui/Badge'

  const columns = [
    { key: 'action', header: 'Action', render: (r: AttendanceRecord) => (
      <Badge variant={r.action === 'clock_in' ? 'success' : 'default'}>
        {r.action === 'clock_in' ? 'Clock In' : 'Clock Out'}
      </Badge>
    )},
    { key: 'recorded_at', header: 'Time', render: (r: AttendanceRecord) => new Date(r.recorded_at).toLocaleString() },
    { key: 'is_within_geofence', header: 'Geofence', render: (r: AttendanceRecord) => (
      <Badge variant={r.is_within_geofence ? 'success' : 'danger'}>
        {r.is_within_geofence ? 'Within' : 'Outside'}
      </Badge>
    )},
  ]

  export default function AttendancePage() {
    const qc = useQueryClient()
    const [geoError, setGeoError] = useState<string | null>(null)
    const [lastResult, setLastResult] = useState<{ action: string; within: boolean; distance: number | null } | null>(null)

    const { data, isLoading } = useQuery({
      queryKey: ['attendance'],
      queryFn: () => attendanceApi.list().then(r => r.data),
    })

    const mutation = useMutation({
      mutationFn: attendanceApi.clock,
      onSuccess: (res) => {
        const d = res.data.data
        setLastResult({ action: d.action, within: d.is_within_geofence, distance: d.distance_m })
        qc.invalidateQueries({ queryKey: ['attendance'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        setGeoError(null)
      },
      onError: () => setGeoError('Failed to record attendance. Please try again.'),
    })

    const requestGeolocation = (action: 'clock_in' | 'clock_out') => {
      setGeoError(null)
      setLastResult(null)
      if (!navigator.geolocation) {
        setGeoError('Geolocation is not supported by your browser.')
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          mutation.mutate({
            action,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          })
        },
        () => setGeoError('Unable to get your location. Please allow location access and try again.'),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }

    const todayStr = new Date().toLocaleDateString()
    const todayRecords = (data?.data ?? []).filter(r => new Date(r.recorded_at).toLocaleDateString() === todayStr)
    const lastActionToday = todayRecords[0]?.action ?? null

    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">Attendance</h1>

        {/* Clock actions */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 max-w-sm space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <MapPin size={14} />
            <span>Your location will be recorded</span>
          </div>

          {lastActionToday && (
            <p className="text-sm text-gray-600">
              Last action today:{' '}
              <Badge variant={lastActionToday === 'clock_in' ? 'success' : 'default'}>
                {lastActionToday === 'clock_in' ? 'Clock In' : 'Clock Out'}
              </Badge>
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => requestGeolocation('clock_in')}
              disabled={mutation.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <LogIn size={16} /> Clock In
            </button>
            <button
              onClick={() => requestGeolocation('clock_out')}
              disabled={mutation.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-200 h-10 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <LogOut size={16} /> Clock Out
            </button>
          </div>

          {mutation.isPending && <p className="text-sm text-gray-500 text-center">Getting your location…</p>}

          {geoError && (
            <p className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={14} /> {geoError}
            </p>
          )}

          {lastResult && (
            <div className="rounded-md bg-gray-50 p-3 text-sm space-y-1">
              <p className="font-medium text-gray-800">
                {lastResult.action === 'clock_in' ? 'Clocked in' : 'Clocked out'} successfully
              </p>
              <p className="text-gray-500">
                Geofence:{' '}
                <Badge variant={lastResult.within ? 'success' : 'warning'}>
                  {lastResult.within ? 'Within range' : 'Outside range'}
                </Badge>
                {lastResult.distance !== null && ` (${lastResult.distance.toFixed(0)} m away)`}
              </p>
            </div>
          )}
        </div>

        {/* Today's records */}
        {todayRecords.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Today's Records</h2>
            <DataTable columns={columns} data={todayRecords} emptyMessage="" />
          </div>
        )}

        {/* Full history */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Full History</h2>
          <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No attendance records." />
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3: Write smoke test + update sidebar + router**

  ```tsx
  // frontend/src/pages/AttendancePage.test.tsx
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
  ```

  In `Sidebar.tsx`, add to `allLinks` (seller-visible):
  ```tsx
  import { Clock } from 'lucide-react'
  { to: '/attendance', label: 'Attendance', icon: Clock, roles: ['admin', 'store_keeper', 'seller'] as const },
  ```

  In `router.tsx`, add flat (all authenticated roles):
  ```tsx
  import AttendancePage from '@/pages/AttendancePage'
  { path: 'attendance', element: <AttendancePage /> },
  ```

- [ ] **Step 4: Run tests + tsc + Commit**

  ```bash
  cd frontend
  npx vitest run && npx tsc --noEmit
  cd ..
  git add frontend/src/api/attendance.ts \
          frontend/src/pages/AttendancePage.tsx \
          frontend/src/pages/AttendancePage.test.tsx \
          frontend/src/components/layout/Sidebar.tsx \
          frontend/src/router.tsx
  git commit -m "feat(frontend): attendance clock-in/out with geolocation + history"
  ```

---

## Task 4: Frontend — Expenses form + P&L report page

**Files:**
- Create: `frontend/src/api/expenses.ts`
- Create: `frontend/src/pages/ExpensesPage.tsx`
- Create: `frontend/src/pages/PnlPage.tsx`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Test: `frontend/src/pages/ExpensesPage.test.tsx`

- [ ] **Step 1: Create `frontend/src/api/expenses.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { PaginatedResponse, ApiResponse } from '@/types'

  export const EXPENSE_CATEGORIES = [
    'salary', 'security', 'electricity', 'cleanliness', 'rent', 'transport',
  ] as const

  export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

  export interface Expense {
    id: number
    location_id: number
    category: ExpenseCategory
    amount: string
    expense_date: string
    recorded_by: number
    notes: string | null
  }

  export interface PnlData {
    location_id: number | null
    period: { from: string; to: string }
    revenue: string
    cost_of_goods_sold: string
    gross_profit: string
    expenses: string
    net_profit: string
    expense_breakdown: Array<{ category: string; total: string }>
  }

  export const expensesApi = {
    list: (page = 1) =>
      api.get<PaginatedResponse<Expense>>('/expenses', { params: { page } }),
    create: (data: { category: ExpenseCategory; amount: number; expense_date: string; notes?: string; location_id?: number }) =>
      api.post<ApiResponse<Expense>>('/expenses', data),
  }

  export const pnlApi = {
    get: (params: { from: string; to: string; location_id?: number }) =>
      api.get<{ data: PnlData }>('/reports/pnl', { params }),
  }
  ```

- [ ] **Step 2: Create `frontend/src/pages/ExpensesPage.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { expensesApi, EXPENSE_CATEGORIES, type Expense } from '@/api/expenses'
  import DataTable from '@/components/ui/DataTable'

  const columns = [
    { key: 'expense_date', header: 'Date' },
    { key: 'category', header: 'Category', render: (e: Expense) => <span className="capitalize">{e.category}</span> },
    { key: 'amount', header: 'Amount (TZS)', render: (e: Expense) => Number(e.amount).toLocaleString('en-US') },
    { key: 'notes', header: 'Notes', render: (e: Expense) => e.notes ?? '—' },
  ]

  export default function ExpensesPage() {
    const qc = useQueryClient()
    const [category, setCategory] = useState<typeof EXPENSE_CATEGORIES[number]>('rent')
    const [amount, setAmount] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [notes, setNotes] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const { data, isLoading } = useQuery({
      queryKey: ['expenses'],
      queryFn: () => expensesApi.list().then(r => r.data),
    })

    const mutation = useMutation({
      mutationFn: expensesApi.create,
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['expenses'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        setAmount('')
        setNotes('')
        setError(null)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      },
      onError: () => { setError('Failed to record expense.'); setSuccess(false) },
    })

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      const parsedAmount = Number(amount)
      if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
        setError('Enter a valid amount greater than 0.')
        return
      }
      setError(null)
      mutation.mutate({ category, amount: parsedAmount, expense_date: date, notes: notes || undefined })
    }

    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>

        {/* Add expense form */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 max-w-lg">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Record Expense</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="exp-category" className="block text-sm font-medium text-gray-700">Category</label>
                <select
                  id="exp-category"
                  value={category}
                  onChange={e => setCategory(e.target.value as typeof category)}
                  className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm capitalize focus:outline-none focus:ring-1 focus:ring-primary-600"
                >
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="exp-date" className="block text-sm font-medium text-gray-700">Date</label>
                <input
                  id="exp-date"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
                />
              </div>
            </div>
            <div>
              <label htmlFor="exp-amount" className="block text-sm font-medium text-gray-700">Amount (TZS)</label>
              <input
                id="exp-amount"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 500000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
            <div>
              <label htmlFor="exp-notes" className="block text-sm font-medium text-gray-700">Notes (optional)</label>
              <input
                id="exp-notes"
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Expense recorded.</p>}
            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Recording…' : 'Record Expense'}
            </button>
          </form>
        </div>

        {/* Expenses list */}
        <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No expenses recorded." />
      </div>
    )
  }
  ```

- [ ] **Step 3: Create `frontend/src/pages/PnlPage.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useQuery } from '@tanstack/react-query'
  import { pnlApi } from '@/api/expenses'

  const thisMonth = new Date()
  const defaultFrom = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}-01`
  const defaultTo = new Date().toISOString().split('T')[0]

  function formatTzs(value: string) {
    return `TZS ${Number(value).toLocaleString('en-US')}`
  }

  export default function PnlPage() {
    const [from, setFrom] = useState(defaultFrom)
    const [to, setTo] = useState(defaultTo)

    const { data, isLoading, refetch } = useQuery({
      queryKey: ['pnl', from, to],
      queryFn: () => pnlApi.get({ from, to }).then(r => r.data.data),
      enabled: false,
    })

    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">P&L Report</h1>

        {/* Date filter */}
        <div className="flex items-end gap-3">
          <div>
            <label htmlFor="pnl-from" className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input id="pnl-from" type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>
          <div>
            <label htmlFor="pnl-to" className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input id="pnl-to" type="date" value={to} onChange={e => setTo(e.target.value)}
              className="rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isLoading ? 'Loading…' : 'Generate Report'}
          </button>
          <a
            href="/api/v1/reports/monthly"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center rounded-md border border-gray-200 px-4 h-10 text-sm text-gray-600 hover:bg-gray-50"
          >
            Download Monthly PDF
          </a>
        </div>

        {/* Results */}
        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {[
                { label: 'Revenue', value: data.revenue, color: 'text-gray-900' },
                { label: 'Cost of Goods Sold', value: data.cost_of_goods_sold, color: 'text-gray-500' },
                { label: 'Gross Profit', value: data.gross_profit, color: 'text-blue-700' },
                { label: 'Total Expenses', value: data.expenses, color: 'text-red-600' },
                { label: 'Net Profit', value: data.net_profit, color: Number(data.net_profit) >= 0 ? 'text-green-700' : 'text-red-700' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg border border-gray-200 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${color}`}>{formatTzs(value)}</p>
                </div>
              ))}
            </div>

            {data.expense_breakdown.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700">Expense Breakdown</h3>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {data.expense_breakdown.map(row => (
                      <tr key={row.category}>
                        <td className="px-4 py-3 capitalize text-gray-700">{row.category}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{formatTzs(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!data && !isLoading && (
          <p className="text-sm text-gray-400">Select a date range and click Generate Report.</p>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 4: Write smoke test + update sidebar + router**

  ```tsx
  // frontend/src/pages/ExpensesPage.test.tsx
  import { it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { AuthProvider } from '@/contexts/AuthContext'
  import ExpensesPage from './ExpensesPage'

  it('expenses page renders heading and form', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
    render(
      <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
        <ExpensesPage />
      </MemoryRouter></AuthProvider></QueryClientProvider>
    )
    expect(screen.getByRole('heading', { name: /expenses/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
  })
  ```

  Add to `Sidebar.tsx` links:
  ```tsx
  import { Receipt, TrendingUp } from 'lucide-react'
  { to: '/expenses',    label: 'Expenses',   icon: Receipt,    roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/reports/pnl', label: 'P&L Report', icon: TrendingUp, roles: ['admin', 'store_keeper'] as const },
  ```

  Add to `router.tsx` AppLayout children:
  ```tsx
  import ExpensesPage from '@/pages/ExpensesPage'
  import PnlPage from '@/pages/PnlPage'
  // Flat (all authenticated) or in appropriate RoleRoute:
  { path: 'expenses', element: <ExpensesPage /> },
  // Admin + store_keeper only:
  // (inside RoleRoute allow=['admin','store_keeper'] group)
  { path: 'reports/pnl', element: <PnlPage /> },
  ```

- [ ] **Step 5: Run tests + tsc + Commit**

  ```bash
  cd frontend && npx vitest run && npx tsc --noEmit
  cd ..
  git add frontend/src/api/expenses.ts \
          frontend/src/pages/ExpensesPage.tsx frontend/src/pages/PnlPage.tsx \
          frontend/src/pages/ExpensesPage.test.tsx \
          frontend/src/components/layout/Sidebar.tsx frontend/src/router.tsx
  git commit -m "feat(frontend): expenses form, P&L report with date range, download PDF link"
  ```

---

## Task 5: UX polish — cache invalidation, NaN guards, TypeScript cleanup

**Files:**
- Modify: `frontend/src/pages/sales/NewSalePage.tsx` (invalidate stock+dashboard after sale)
- Modify: `frontend/src/pages/purchases/NewPurchasePage.tsx` (invalidate stock+dashboard)
- Modify: `frontend/src/pages/distributions/CreateDistributionPage.tsx` (invalidate stock+dashboard)
- Modify: `frontend/src/components/layout/Sidebar.tsx` (`role as never` → `role as Role`)
- Modify: `frontend/src/pages/sales/NewSalePage.tsx` (NaN guard on discount)
- Modify: `frontend/src/pages/purchases/NewPurchasePage.tsx` (NaN guard on qty/cost)
- Delete: `frontend/src/App.tsx` (orphaned)

**No new tests needed** — the polish items fix existing behavior; existing tests still cover the components.

- [ ] **Step 1: Fix `role as never` in `frontend/src/components/layout/Sidebar.tsx`**

  Import `Role` from types:
  ```tsx
  import type { Role } from '@/types'
  ```

  Change:
  ```tsx
  const links = allLinks.filter(l => l.roles.includes(role as never))
  ```
  to:
  ```tsx
  const links = allLinks.filter(l => l.roles.includes(role as Role))
  ```

  Also change:
  ```tsx
  const role = user?.role ?? 'seller'
  ```
  to:
  ```tsx
  const role: Role = user?.role ?? 'seller'
  ```

- [ ] **Step 2: Add cache invalidation to `frontend/src/pages/sales/NewSalePage.tsx`**

  In the `useMutation` `onSuccess` callback, after `qc.invalidateQueries({ queryKey: ['sales'] })`, add:
  ```tsx
  qc.invalidateQueries({ queryKey: ['stock'] })
  qc.invalidateQueries({ queryKey: ['stock-expiry'] })
  qc.invalidateQueries({ queryKey: ['stock-low'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  ```

- [ ] **Step 3: Add NaN guard to discount in `frontend/src/pages/sales/NewSalePage.tsx`**

  Change the discount `useState`:
  ```tsx
  const [discount, setDiscount] = useState(0)
  ```

  Change its input `onChange`:
  ```tsx
  onChange={e => {
    const v = e.target.value === '' ? 0 : Number(e.target.value)
    setDiscount(isNaN(v) ? 0 : v)
  }}
  ```

- [ ] **Step 4: Add cache invalidation to `frontend/src/pages/purchases/NewPurchasePage.tsx`**

  In `onSuccess`:
  ```tsx
  qc.invalidateQueries({ queryKey: ['stock'] })
  qc.invalidateQueries({ queryKey: ['stock-expiry'] })
  qc.invalidateQueries({ queryKey: ['stock-low'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  ```

  Add NaN guard on qty and unit_cost inputs in `updateItem`:
  ```tsx
  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    const safeValue = typeof value === 'number' && isNaN(value) ? 0 : value
    setItems(prev => prev.map((i, j) => j === idx ? { ...i, [field]: safeValue } : i))
  }
  ```

  And update the number inputs' `onChange`:
  ```tsx
  // For quantity:
  onChange={e => updateItem(idx, 'quantity', e.target.value === '' ? 1 : Number(e.target.value))}
  // For unit_cost:
  onChange={e => updateItem(idx, 'unit_cost', e.target.value === '' ? 0 : Number(e.target.value))}
  ```

- [ ] **Step 5: Add cache invalidation to `frontend/src/pages/distributions/CreateDistributionPage.tsx`**

  In `onSuccess`:
  ```tsx
  qc.invalidateQueries({ queryKey: ['stock'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  ```

- [ ] **Step 6: Delete `frontend/src/App.tsx`** (orphaned — main.tsx bypasses it)

  ```bash
  cd frontend
  rm src/App.tsx
  ```

- [ ] **Step 7: Verify TypeScript is still clean**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no output (no errors). If removing `App.tsx` causes any import error, search for remaining imports with `grep -r "from.*App" src/` — but main.tsx was already updated in Task 1 of Phase 7 to not use App.tsx.

- [ ] **Step 8: Run full frontend test suite**

  ```bash
  npx vitest run
  ```

  Expected: all existing tests still pass.

- [ ] **Step 9: Commit + update progress ledger + final merge**

  ```bash
  cd ..
  git add frontend/src/components/layout/Sidebar.tsx \
          frontend/src/pages/sales/NewSalePage.tsx \
          frontend/src/pages/purchases/NewPurchasePage.tsx \
          frontend/src/pages/distributions/CreateDistributionPage.tsx
  git rm frontend/src/App.tsx
  git add .superpowers/sdd/progress.md
  git commit -m "fix(frontend): cache invalidation after mutations, NaN guards, role as Role, remove App.tsx"
  ```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Rate limiting on POST /login (throttle 5/min) | 1 |
| Stock views with security_invoker=true (RLS on view queries) | 1 |
| Daily reconciliation form (seller) | 2 |
| Attendance clock-in/out with geolocation | 3 |
| `is_within_geofence` + `distance_m` displayed | 3 |
| Expenses form (6 categories, TZS) | 4 |
| P&L report with date range + download PDF | 4 |
| role as never → role as Role TypeScript cleanup | 5 |
| App.tsx orphan removed | 5 |
| Cache invalidation: sale/purchase/dist → stock + dashboard stale | 5 |
| NaN guards on number inputs | 5 |

**Gaps:** Accessibility fixes (aria-label on trash buttons, htmlFor on existing distribution/sale forms) are noted but excluded — they require touching many lines in existing form files for cosmetic improvement only. They are deferred to v1.1.

**Placeholder scan:** All code blocks complete. No TBD patterns.

**Type consistency:**
- `ExpenseCategory` from `EXPENSE_CATEGORIES as const` — used in `expensesApi.create()` payload and the form `setCategory` state.
- `ClockPayload.action` = `'clock_in' | 'clock_out'` — matches backend enum exactly.
- `role as Role` in Sidebar — `Role = 'admin' | 'store_keeper' | 'seller'` already exported from `src/types/index.ts`.
