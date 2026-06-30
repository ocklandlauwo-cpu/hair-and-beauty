# Phase 11 — Reconciliation Verification + Accessibility Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin reconciliation verification (backend endpoint + frontend button) and fix missing `aria-label`/`htmlFor` on icon buttons and form labels in three form pages.

**Architecture:** Task 1 is fullstack — a single new `POST /reconciliations/:id/verify` endpoint (admin-only, sets `verified_by`/`verified_at`) plus a Verify button in the ReconciliationPage. Task 2 is frontend-only accessibility hardening: adding `aria-label` to three Trash2 icon buttons and `htmlFor`/`id` pairs to unlabeled form controls. Both tasks are independently shippable.

**Tech Stack:** Laravel 12 (PHP 8.4, Pest 4), React 19, TypeScript 5.9, TanStack Query 5, Tailwind CSS v4, Vitest 4.

## Global Constraints

- PHP binary: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe`
- Backend test runner: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan test` from `backend/`
- Frontend test runner: `cd frontend && npx vitest run` (PowerShell)
- TypeScript check: `cd frontend && npx tsc --noEmit` (PowerShell)
- Authorization: `$user->role === 'admin'` in PHP; `user?.role === 'admin'` in React — NOT `hasRole()`
- Tailwind CSS v4 CSS-first token classes — no `tailwind.config.js`
- Input className pattern: `"mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"`
- TanStack Query v5: `queryKey: ['reconciliations']` — invalidate on verify success
- GUC test pattern: `DB::statement("SELECT set_config('app.role', 'seller', false)")` + `try/finally { DB::unprepared('RESET app.role') }`
- Backend DB connection for test: `pgsql` (hairbeauty_app role, subject to RLS); `TestCase::setUp()` pre-sets `app.role=admin`
- `Sanctum::actingAs($user)` to authenticate in Pest tests

---

## File Map

**Task 1 — Reconciliation verification:**
- Create: `backend/app/Http/Controllers/Api/V1/VerifyReconciliationController.php`
- Modify: `backend/routes/api.php` — add `use` import + route
- Create: `backend/tests/Feature/Api/VerifyReconciliationTest.php`
- Modify: `frontend/src/api/reconciliations.ts` — add `verify()` method
- Modify: `frontend/src/pages/ReconciliationPage.tsx` — add Verify button for admin

**Task 2 — Accessibility fixes:**
- Modify: `frontend/src/pages/sales/NewSalePage.tsx` — `aria-label` on Trash2, `htmlFor`/`id` on 3 controls
- Modify: `frontend/src/pages/purchases/NewPurchasePage.tsx` — `aria-label` on Trash2, `htmlFor`/`id` on 4 per-item controls
- Modify: `frontend/src/pages/distributions/CreateDistributionPage.tsx` — `aria-label` on Trash2, `htmlFor`/`id` on Destination Shop

---

## Task 1: Reconciliation Verification

**Files:**
- Create: `backend/app/Http/Controllers/Api/V1/VerifyReconciliationController.php`
- Modify: `backend/routes/api.php`
- Create: `backend/tests/Feature/Api/VerifyReconciliationTest.php`
- Modify: `frontend/src/api/reconciliations.ts`
- Modify: `frontend/src/pages/ReconciliationPage.tsx`

**Interfaces:**
- Produces: `POST /api/v1/reconciliations/{reconciliation}/verify` → `{data: Reconciliation}` (200) | `{message}` (422 already verified) | 403 (non-admin)
- Produces: `reconciliationsApi.verify(id: number)` → `Promise<AxiosResponse<ApiResponse<Reconciliation>>>`

- [ ] **Step 1: Write the failing Pest tests**

Create `backend/tests/Feature/Api/VerifyReconciliationTest.php`:

```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can verify a pending reconciliation', function () {
    $shopId = DB::table('locations')->insertGetId([
        'name' => 'VRShop' . uniqid(),
        'type' => 'shop',
        'geofence_radius_m' => 100,
        'is_active' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    $admin = User::factory()->create(['role' => 'admin']);
    $locationIdsJson = json_encode([$shopId]);

    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");
    Sanctum::actingAs($seller);
    try {
        $rec = $this->postJson('/api/v1/reconciliations', [
            'reconciliation_date' => today()->toDateString(),
            'total_sold_amount'   => 200000,
        ])->assertCreated()->json('data');
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }

    DB::statement("SELECT set_config('app.role', 'admin', false)");
    Sanctum::actingAs($admin);
    $this->postJson("/api/v1/reconciliations/{$rec['id']}/verify")
        ->assertOk()
        ->assertJsonPath('data.verified_by', $admin->id)
        ->assertJsonStructure(['data' => ['id', 'verified_by', 'verified_at']]);
});

it('seller cannot verify a reconciliation', function () {
    $shopId = DB::table('locations')->insertGetId([
        'name' => 'VRShop2' . uniqid(),
        'type' => 'shop',
        'geofence_radius_m' => 100,
        'is_active' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    $locationIdsJson = json_encode([$shopId]);

    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");
    Sanctum::actingAs($seller);
    try {
        $rec = $this->postJson('/api/v1/reconciliations', [
            'reconciliation_date' => today()->toDateString(),
            'total_sold_amount'   => 100000,
        ])->assertCreated()->json('data');

        $this->postJson("/api/v1/reconciliations/{$rec['id']}/verify")
            ->assertForbidden();
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('cannot verify an already-verified reconciliation', function () {
    $shopId = DB::table('locations')->insertGetId([
        'name' => 'VRShop3' . uniqid(),
        'type' => 'shop',
        'geofence_radius_m' => 100,
        'is_active' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    $admin = User::factory()->create(['role' => 'admin']);
    $locationIdsJson = json_encode([$shopId]);

    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");
    Sanctum::actingAs($seller);
    try {
        $rec = $this->postJson('/api/v1/reconciliations', [
            'reconciliation_date' => today()->toDateString(),
            'total_sold_amount'   => 50000,
        ])->assertCreated()->json('data');
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }

    DB::statement("SELECT set_config('app.role', 'admin', false)");
    Sanctum::actingAs($admin);
    $this->postJson("/api/v1/reconciliations/{$rec['id']}/verify")->assertOk();
    $this->postJson("/api/v1/reconciliations/{$rec['id']}/verify")->assertStatus(422);
});
```

- [ ] **Step 2: Run tests — confirm they fail (route not found)**

```powershell
cd backend; C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan test tests/Feature/Api/VerifyReconciliationTest.php
```

Expected: FAIL — 404 (route not registered yet)

- [ ] **Step 3: Create `backend/app/Http/Controllers/Api/V1/VerifyReconciliationController.php`**

```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Reconciliation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VerifyReconciliationController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'seller_id', 'reconciliation_date',
        'total_sold_amount', 'notes', 'verified_by', 'verified_at'];

    public function __invoke(Request $request, Reconciliation $reconciliation): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            abort(403, 'Only admins can verify reconciliations.');
        }

        if ($reconciliation->verified_by !== null) {
            return response()->json(['message' => 'Reconciliation is already verified.'], 422);
        }

        $reconciliation->update([
            'verified_by' => $request->user()->id,
            'verified_at' => now(),
        ]);

        return response()->json(['data' => $reconciliation->fresh()->only(self::FIELDS)]);
    }
}
```

- [ ] **Step 4: Register the route in `backend/routes/api.php`**

Add the `use` import at the top with the other controller imports:
```php
use App\Http\Controllers\Api\V1\VerifyReconciliationController;
```

Add the route immediately after the existing reconciliations line:
```php
// current line:
Route::apiResource('/reconciliations', ReconciliationController::class)->only(['index', 'store']);
// add this line:
Route::post('/reconciliations/{reconciliation}/verify', VerifyReconciliationController::class)->name('reconciliations.verify');
```

- [ ] **Step 5: Run tests — confirm all 3 pass**

```powershell
cd backend; C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan test tests/Feature/Api/VerifyReconciliationTest.php
```

Expected: PASS (3 tests)

- [ ] **Step 6: Run full backend test suite — confirm no regressions**

```powershell
cd backend; C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan test
```

Expected: all existing tests pass + 3 new tests. Count increases by 3.

- [ ] **Step 7: Extend `frontend/src/api/reconciliations.ts` — add `verify()`**

Replace the entire file with:

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
  verify: (id: number) =>
    api.post<ApiResponse<Reconciliation>>(`/reconciliations/${id}/verify`),
}
```

- [ ] **Step 8: Update `frontend/src/pages/ReconciliationPage.tsx` — add Verify button for admin**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle } from 'lucide-react'
import { reconciliationsApi, type Reconciliation } from '@/api/reconciliations'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

const today = new Date().toISOString().split('T')[0]

export default function ReconciliationPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['reconciliations'],
    queryFn: () => reconciliationsApi.list().then(r => r.data),
  })

  const alreadySubmittedToday = data?.data.some(r => r.reconciliation_date === today) ?? false

  const submitMutation = useMutation({
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

  const verifyMutation = useMutation({
    mutationFn: (id: number) => reconciliationsApi.verify(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliations'] })
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
    submitMutation.mutate({ reconciliation_date: today, total_sold_amount: parsedAmount, notes: notes || undefined })
  }

  const columns = [
    { key: 'reconciliation_date', header: 'Date' },
    {
      key: 'total_sold_amount',
      header: 'Total Sold (TZS)',
      render: (r: Reconciliation) => Number(r.total_sold_amount).toLocaleString('en-US'),
    },
    { key: 'notes', header: 'Notes', render: (r: Reconciliation) => r.notes ?? '—' },
    {
      key: 'verified_by',
      header: 'Status',
      render: (r: Reconciliation) =>
        r.verified_by
          ? <Badge variant="success">Verified</Badge>
          : <Badge variant="warning">Pending verification</Badge>,
    },
    ...(isAdmin ? [{
      key: 'verify_action',
      header: '',
      render: (r: Reconciliation) => !r.verified_by ? (
        <button
          onClick={() => verifyMutation.mutate(r.id)}
          disabled={verifyMutation.isPending}
          className="text-xs text-primary-600 hover:underline disabled:opacity-50"
          aria-label={`Verify reconciliation for ${r.reconciliation_date}`}
        >
          Verify
        </button>
      ) : null,
    }] : []),
  ]

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
              disabled={submitMutation.isPending}
              className="w-full rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {submitMutation.isPending ? 'Submitting…' : 'Submit Reconciliation'}
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
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          emptyMessage="No reconciliations yet."
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Run frontend tests — confirm existing ReconciliationPage test still passes**

```powershell
cd frontend; npx vitest run src/pages/ReconciliationPage.test.tsx
```

Expected: PASS (1 test — `reconciliation page renders heading and form`)

**Note:** The existing test uses `enabled: false` on the QueryClient, so `data` is `undefined` and `alreadySubmittedToday` is `false`, rendering the submit form. The `getByLabelText(/total sold today/i)` assertion still passes because `htmlFor="recon-amount"` is unchanged.

- [ ] **Step 10: TypeScript check**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 11: Run full frontend test suite**

```powershell
cd frontend; npx vitest run
```

Expected: all 23 tests pass (count unchanged)

- [ ] **Step 12: Commit**

```bash
git add backend/app/Http/Controllers/Api/V1/VerifyReconciliationController.php backend/routes/api.php backend/tests/Feature/Api/VerifyReconciliationTest.php frontend/src/api/reconciliations.ts frontend/src/pages/ReconciliationPage.tsx
git commit -m "feat: reconciliation verification — POST /reconciliations/:id/verify (admin) + verify button"
```

---

## Task 2: Accessibility Fixes

**Files:**
- Modify: `frontend/src/pages/sales/NewSalePage.tsx`
- Modify: `frontend/src/pages/purchases/NewPurchasePage.tsx`
- Modify: `frontend/src/pages/distributions/CreateDistributionPage.tsx`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: properly labelled form controls (no interface changes)

This task is purely additive — only `aria-label` attributes and `htmlFor`/`id` pairs are added. No logic changes.

- [ ] **Step 1: Fix `frontend/src/pages/sales/NewSalePage.tsx`**

Three changes in this file:

**Change A** — Trash2 remove button (line ~118, inside the `<td>` at end of each sale item row):

Current:
```tsx
<td className="px-2"><button type="button" onClick={() => setItems(p => p.filter((_, j) => j !== idx))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
```

Replace with:
```tsx
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
```

**Change B** — Payment Method label + select (lines ~130–134):

Current:
```tsx
<label className="block text-sm font-medium text-gray-700">Payment Method</label>
<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}
  className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary-600">
```

Replace with:
```tsx
<label htmlFor="sale-payment" className="block text-sm font-medium text-gray-700">Payment Method</label>
<select id="sale-payment" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}
  className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary-600">
```

**Change C** — Discount label + input (lines ~137–139):

Current:
```tsx
<label className="block text-sm font-medium text-gray-700">Discount (TZS)</label>
<input type="number" min={0} value={discount} onChange={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); setDiscount(isNaN(v) ? 0 : v) }}
  className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
```

Replace with:
```tsx
<label htmlFor="sale-discount" className="block text-sm font-medium text-gray-700">Discount (TZS)</label>
<input id="sale-discount" type="number" min={0} value={discount} onChange={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); setDiscount(isNaN(v) ? 0 : v) }}
  className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
```

- [ ] **Step 2: Fix `frontend/src/pages/purchases/NewPurchasePage.tsx`**

Two changes in this file:

**Change A** — Trash2 remove button (line ~111, in each product card header row):

Current:
```tsx
<button type="button" onClick={() => setItems(p => p.filter((_, j) => j !== idx))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
```

Replace with:
```tsx
<button
  type="button"
  onClick={() => setItems(p => p.filter((_, j) => j !== idx))}
  className="text-gray-300 hover:text-red-500"
  aria-label={`Remove ${item.product.name}`}
>
  <Trash2 size={14} />
</button>
```

**Change B** — The four inline labels in each product card grid ("Qty", "Cost (TZS)", "Batch #", "Expiry") are inside a loop. Add `htmlFor`/`id` pairs using the product id for uniqueness.

Current grid section (inside the `{items.map((item, idx) => (` loop):
```tsx
<div className="grid grid-cols-4 gap-2 text-xs">
  <div>
    <label className="text-gray-500">Qty</label>
    <input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value === '' ? 1 : Number(e.target.value))}
      className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
  </div>
  <div>
    <label className="text-gray-500">Cost (TZS)</label>
    <input type="number" min={0} value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value === '' ? 0 : Number(e.target.value))}
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
```

Replace with:
```tsx
<div className="grid grid-cols-4 gap-2 text-xs">
  <div>
    <label htmlFor={`purchase-qty-${item.product.id}`} className="text-gray-500">Qty</label>
    <input
      id={`purchase-qty-${item.product.id}`}
      type="number" min={1} value={item.quantity}
      onChange={e => updateItem(idx, 'quantity', e.target.value === '' ? 1 : Number(e.target.value))}
      className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
    />
  </div>
  <div>
    <label htmlFor={`purchase-cost-${item.product.id}`} className="text-gray-500">Cost (TZS)</label>
    <input
      id={`purchase-cost-${item.product.id}`}
      type="number" min={0} value={item.unit_cost}
      onChange={e => updateItem(idx, 'unit_cost', e.target.value === '' ? 0 : Number(e.target.value))}
      className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
    />
  </div>
  <div>
    <label htmlFor={`purchase-batch-${item.product.id}`} className="text-gray-500">Batch #</label>
    <input
      id={`purchase-batch-${item.product.id}`}
      type="text" value={item.batch_number}
      onChange={e => updateItem(idx, 'batch_number', e.target.value)}
      className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
    />
  </div>
  <div>
    <label htmlFor={`purchase-expiry-${item.product.id}`} className="text-gray-500">Expiry</label>
    <input
      id={`purchase-expiry-${item.product.id}`}
      type="date" value={item.expiry_date}
      onChange={e => updateItem(idx, 'expiry_date', e.target.value)}
      className="mt-1 block w-full rounded border border-gray-200 h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
    />
  </div>
</div>
```

- [ ] **Step 3: Fix `frontend/src/pages/distributions/CreateDistributionPage.tsx`**

Two changes in this file:

**Change A** — "Destination Shop" label + select (lines ~57–62):

Current:
```tsx
<label className="block text-sm font-medium text-gray-700">Destination Shop</label>
<select value={toLocationId} onChange={e => setToLocationId(e.target.value)} required
  className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
  <option value="">Select shop…</option>
  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
</select>
```

Replace with:
```tsx
<label htmlFor="dist-dest" className="block text-sm font-medium text-gray-700">Destination Shop</label>
<select id="dist-dest" value={toLocationId} onChange={e => setToLocationId(e.target.value)} required
  className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
  <option value="">Select shop…</option>
  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
</select>
```

**Change B** — Trash2 remove button (line ~90, inside each distribution item row):

Current:
```tsx
<button type="button" onClick={() => setItems(prev => prev.filter((_, j) => j !== idx))} className="text-gray-400 hover:text-red-500">
  <Trash2 size={14} />
</button>
```

Replace with:
```tsx
<button
  type="button"
  onClick={() => setItems(prev => prev.filter((_, j) => j !== idx))}
  className="text-gray-400 hover:text-red-500"
  aria-label={`Remove ${item.product_name}`}
>
  <Trash2 size={14} />
</button>
```

- [ ] **Step 4: TypeScript check**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run full frontend test suite**

```powershell
cd frontend; npx vitest run
```

Expected: all 23 tests pass (count unchanged — no new tests added for accessibility)

- [ ] **Step 6: Run full backend test suite — no regressions**

```powershell
cd backend; C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan test
```

Expected: all existing tests + 3 new verify tests pass (count from Task 1)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/NewSalePage.tsx frontend/src/pages/purchases/NewPurchasePage.tsx frontend/src/pages/distributions/CreateDistributionPage.tsx
git commit -m "fix(a11y): aria-label on icon buttons, htmlFor/id on form controls in sale/purchase/distribution forms"
```

---

## Final: Merge to master

- [ ] **Step 1: Run full test suites**

```powershell
cd backend; C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan test
```
```powershell
cd frontend; npx vitest run
```

Expected: all pass

- [ ] **Step 2: Merge to master**

```bash
git checkout master
git merge feature/phase-11-reconciliation-a11y --no-ff -m "feat: Phase 11 — reconciliation verification, accessibility fixes"
git branch -d feature/phase-11-reconciliation-a11y
```

- [ ] **Step 3: Update progress ledger**

Append to `.superpowers/sdd/progress.md`:

```markdown
## Phase 11: Reconciliation Verification + Accessibility

- [x] P11 Task 1: Reconciliation verification — POST /reconciliations/:id/verify, VerifyReconciliationController, 3 Pest tests, reconciliationsApi.verify(), Verify button in ReconciliationPage
- [x] P11 Task 2: Accessibility — aria-label on Trash2 buttons (sale/purchase/distribution), htmlFor/id on unlabeled form controls

## Phase 11: Reconciliation Verification + Accessibility — COMPLETE ✓

All 2 tasks complete. [N] Pest tests + 23 Vitest tests. Merged to master.
```

---

## Self-Review

**Spec coverage:**
- Reconciliation verify endpoint (backend): ✓ `POST /reconciliations/:id/verify` controller + route
- 3 tests: admin verifies, seller blocked, double-verify blocked: ✓ all 3 in VerifyReconciliationTest.php
- Verify button for admin in ReconciliationPage: ✓ admin-only spread column with `verifyMutation`
- `reconciliationsApi.verify()`: ✓ added to reconciliations.ts
- Non-admin cannot call verify: ✓ role check in controller + test
- Already-verified returns 422: ✓ `$reconciliation->verified_by !== null` guard + test
- `aria-label` on Trash2 buttons: ✓ NewSalePage, NewPurchasePage, CreateDistributionPage
- `htmlFor`/`id` on form controls: ✓ Payment/Discount in NewSalePage; Qty/Cost/Batch/Expiry in NewPurchasePage; Destination Shop in CreateDistributionPage

**Placeholder scan:** No TBD/TODO/placeholder text found. All steps have complete code.

**Type consistency:**
- `reconciliationsApi.verify(id: number)` defined in Task 1, Step 7 → called as `verifyMutation.mutate(r.id)` in Task 1, Step 8 ✓
- `verifyMutation.mutate(r.id)` — `r.id` is `number` (from `Reconciliation.id: number`) — matches `verify(id: number)` ✓
- `id` template literals in NewPurchasePage use `item.product.id` (number) — `id={`purchase-qty-${item.product.id}`}` produces valid string IDs ✓
