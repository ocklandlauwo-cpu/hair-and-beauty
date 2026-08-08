# Sales Analysis Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sales Analysis" tab to the Sales page showing units sold per product, filterable by date range, shop, and product-name search.

**Architecture:** New read-only aggregation endpoint (`GET /sales/analysis`) on the existing `SaleController`, following the same one-off-method-on-the-resource-controller pattern as `PurchaseController::forecast()`. Frontend adds a tab switcher to `SalesPage.tsx` (mirroring `PurchasesPage.tsx`'s History/Forecast tabs) with a new `SalesAnalysisTab` component.

**Tech Stack:** Laravel 11 (PHP), PostgreSQL with row-level security, Pest for backend tests; React + TypeScript, TanStack Query, Vitest + Testing Library for frontend tests.

## Global Constraints

- Reverted sales (`sales.is_reverted = true`) must be excluded from `quantity_sold` — reverting restores stock, so those units weren't actually sold.
- One row per product; the shop filter narrows totals, it does not split rows per shop.
- Columns are exactly: Product, Qty Sold, Shop. No revenue/category columns.
- Shop column shows the selected shop's name when `location_id` is filtered, otherwise the literal string `"All Shops"`.
- Sort order: product name, A–Z.
- Paginate at 50 products per page.
- Access: same three roles as the existing sales list — `admin`, `store_keeper`, `seller` (`SalePolicy::viewAny`). No extra location-scoping code needed — `sales`/`sale_items` already have row-level security policies (`backend/database/migrations/2026_06_26_095634_enable_rls_and_create_policies.php:166-190`) that restrict a `seller`'s visible rows to their own `location_id` automatically via Postgres session variables set by `SetDbSessionContext` middleware.
- No new migrations, no new env vars.
- Search matching style: case-insensitive partial match using `ilike`, matching the existing convention in `ProductController.php:23` and `ClientController.php:57`.

---

### Task 1: Backend — `GET /sales/analysis` endpoint

**Files:**
- Modify: `backend/routes/api.php` (add route immediately before the `Route::apiResource('/sales', SaleController::class)` line, currently at line 84 — same ordering reason as `/purchases/forecast` on line 64, to stop `{sale}` route-model-binding from swallowing `/sales/analysis`)
- Modify: `backend/app/Http/Controllers/Api/V1/SaleController.php` (add `analysis()` method; add `use App\Models\Location;` import)
- Test: `backend/tests/Feature/Api/SalesAnalysisTest.php` (new)

**Interfaces:**
- Produces: `GET /api/v1/sales/analysis?location_id=&date_from=&date_to=&search=&page=` → `{ data: [{ product_id: number, product_name: string, quantity_sold: number, shop: string }], meta: { current_page, last_page, per_page, total } }`

- [ ] **Step 1: Write the failing test file**

```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function salesAnalysisFixtures(): array
{
    $shopA = DB::table('locations')->insertGetId(['name' => 'SAAShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shopB = DB::table('locations')->insertGetId(['name' => 'SABShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId = DB::table('categories')->insertGetId(['name' => 'SACat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);

    $admin = User::factory()->admin()->create();
    $storeKeeper = User::factory()->storeKeeper()->create();
    $seller = User::factory()->seller()->create(['location_id' => $shopA]);

    $alpha = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'Analysis Product Alpha', 'wholesale_price' => 1000, 'retail_price' => 1500, 'created_at' => now(), 'updated_at' => now()]);
    $beta  = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'Analysis Product Beta',  'wholesale_price' => 500,  'retail_price' => 800,  'created_at' => now(), 'updated_at' => now()]);

    // Shop A: 5 Alpha sold today (kept)
    $saleA1 = DB::table('sales')->insertGetId(['location_id' => $shopA, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 7500, 'discount_amount' => 0, 'is_reverted' => false, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleA1, 'product_id' => $alpha, 'quantity' => 5, 'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now()]);

    // Shop A: 100 Alpha sold today but REVERTED — must be excluded
    $saleA2 = DB::table('sales')->insertGetId(['location_id' => $shopA, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 150000, 'discount_amount' => 0, 'is_reverted' => true, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleA2, 'product_id' => $alpha, 'quantity' => 100, 'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now()]);

    // Shop B: 2 Alpha sold today (kept)
    $saleB1 = DB::table('sales')->insertGetId(['location_id' => $shopB, 'sold_by' => $admin->id, 'payment_method' => 'nmb', 'total_amount' => 3000, 'discount_amount' => 0, 'is_reverted' => false, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleB1, 'product_id' => $alpha, 'quantity' => 2, 'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now()]);

    // Shop A: 3 Beta sold today (kept)
    $saleA3 = DB::table('sales')->insertGetId(['location_id' => $shopA, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 2400, 'discount_amount' => 0, 'is_reverted' => false, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleA3, 'product_id' => $beta, 'quantity' => 3, 'unit_price' => 800, 'unit_cost' => 500, 'price_tier' => 'retail', 'created_at' => now()]);

    // Shop A: 50 Beta sold 60 days ago (kept in the table, but outside a "last 7 days" filter)
    $saleOld = DB::table('sales')->insertGetId(['location_id' => $shopA, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 40000, 'discount_amount' => 0, 'is_reverted' => false, 'sale_date' => today()->subDays(60), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleOld, 'product_id' => $beta, 'quantity' => 50, 'unit_price' => 800, 'unit_cost' => 500, 'price_tier' => 'retail', 'created_at' => now()]);

    return compact('shopA', 'shopB', 'alpha', 'beta', 'admin', 'storeKeeper', 'seller');
}

it('sums quantity across all shops when no location filter is applied, excluding reverted sales', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson('/api/v1/sales/analysis?date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk()
        ->assertJsonStructure(['data' => [['product_id', 'product_name', 'quantity_sold', 'shop']], 'meta']);

    $rows = collect($response->json('data'));
    $alphaRow = $rows->firstWhere('product_id', $f['alpha']);

    expect($alphaRow['quantity_sold'])->toBe(7); // 5 (shop A) + 2 (shop B), 100 reverted excluded
    expect($alphaRow['shop'])->toBe('All Shops');
});

it('location_id filter narrows totals to that shop and labels the shop by name', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);
    $shopAName = DB::table('locations')->where('id', $f['shopA'])->value('name');

    $response = $this->getJson('/api/v1/sales/analysis?location_id='.$f['shopA'].'&date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk();

    $alphaRow = collect($response->json('data'))->firstWhere('product_id', $f['alpha']);

    expect($alphaRow['quantity_sold'])->toBe(5); // only shop A's non-reverted sale
    expect($alphaRow['shop'])->toBe($shopAName);
});

it('search filters by partial, case-insensitive product name', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson('/api/v1/sales/analysis?search=alpha&date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk();

    $names = collect($response->json('data'))->pluck('product_name');

    expect($names)->toContain('Analysis Product Alpha');
    expect($names)->not->toContain('Analysis Product Beta');
});

it('date range filter excludes sales outside the window', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson('/api/v1/sales/analysis?date_from='.today()->subDays(7)->toDateString().'&date_to='.today()->toDateString())
        ->assertOk();

    $betaRow = collect($response->json('data'))->firstWhere('product_id', $f['beta']);

    expect($betaRow['quantity_sold'])->toBe(3); // only today's 3, the 50-sold-60-days-ago is excluded
});

it('results are sorted by product name A-Z', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson('/api/v1/sales/analysis?date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk();

    $names = collect($response->json('data'))->pluck('product_name')->values()->all();

    expect($names)->toBe(collect($names)->sort()->values()->all());
});

it('store_keeper and seller can both access the endpoint', function () {
    $f = salesAnalysisFixtures();

    Sanctum::actingAs($f['storeKeeper']);
    $this->getJson('/api/v1/sales/analysis')->assertOk();

    Sanctum::actingAs($f['seller']);
    $this->getJson('/api/v1/sales/analysis')->assertOk();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && php artisan test tests/Feature/Api/SalesAnalysisTest.php`
Expected: FAIL — route `sales/analysis` not found (404), since neither the route nor the controller method exist yet.

- [ ] **Step 3: Add the route**

In `backend/routes/api.php`, immediately before the existing line:
```php
Route::apiResource('/sales', SaleController::class)->only(['index', 'show']);
```
add:
```php
Route::get('/sales/analysis', [SaleController::class, 'analysis'])->name('sales.analysis');
```

- [ ] **Step 4: Add the controller method**

In `backend/app/Http/Controllers/Api/V1/SaleController.php`, add the import near the top:
```php
use App\Models\Location;
```

Then add this method to the `SaleController` class (after `index()`, before `show()`):
```php
public function analysis(Request $request): JsonResponse
{
    $this->authorize('viewAny', Sale::class);

    $request->validate([
        'location_id' => ['nullable', 'integer', 'exists:locations,id'],
        'date_from'   => ['nullable', 'date'],
        'date_to'     => ['nullable', 'date'],
        'search'      => ['nullable', 'string', 'max:255'],
        'page'        => ['nullable', 'integer', 'min:1'],
    ]);

    $dateFrom   = $request->query('date_from', now()->startOfMonth()->toDateString());
    $dateTo     = $request->query('date_to',   now()->toDateString());
    $locationId = $request->query('location_id');

    $rows = DB::table('sale_items as si')
        ->join('sales as s', 's.id', '=', 'si.sale_id')
        ->join('products as p', 'p.id', '=', 'si.product_id')
        ->where('s.is_reverted', false)
        ->whereDate('s.sale_date', '>=', $dateFrom)
        ->whereDate('s.sale_date', '<=', $dateTo)
        ->when($locationId, fn ($q, $v) => $q->where('s.location_id', $v))
        ->when($request->query('search'), fn ($q, $v) => $q->where('p.name', 'ilike', "%{$v}%"))
        ->groupBy('p.id', 'p.name')
        ->orderBy('p.name')
        ->select('p.id as product_id', 'p.name as product_name', DB::raw('SUM(si.quantity) as quantity_sold'))
        ->paginate(50);

    $shopLabel = $locationId ? Location::find($locationId)?->name : null;

    return response()->json($rows->through(fn ($row) => [
        'product_id'    => $row->product_id,
        'product_name'  => $row->product_name,
        'quantity_sold' => (int) $row->quantity_sold,
        'shop'          => $shopLabel ?? 'All Shops',
    ]));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && php artisan test tests/Feature/Api/SalesAnalysisTest.php`
Expected: PASS (all 6 tests)

- [ ] **Step 6: Run the full backend test suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS (no regressions in `SalesTest.php`, `PurchaseForecastTest.php`, or elsewhere)

- [ ] **Step 7: Commit**

```bash
git add backend/routes/api.php backend/app/Http/Controllers/Api/V1/SaleController.php backend/tests/Feature/Api/SalesAnalysisTest.php
git commit -m "feat(sales): add sales analysis aggregation endpoint"
```

---

### Task 2: Frontend — API client method

**Files:**
- Modify: `frontend/src/api/sales.ts`

**Interfaces:**
- Consumes: `GET /sales/analysis` from Task 1, response shape `{ data: SalesAnalysisRow[], meta: {...} }`
- Produces: `salesApi.analysis(params)` and exported `SalesAnalysisRow` type, for Task 3 to consume.

- [ ] **Step 1: Add the type and API method**

In `frontend/src/api/sales.ts`, add after the `SaleDetail` interface:
```ts
export interface SalesAnalysisRow {
  product_id: number
  product_name: string
  quantity_sold: number
  shop: string
}
```

And add to the `salesApi` object (after `revert`):
```ts
  analysis: (params?: { location_id?: number | ''; date_from?: string; date_to?: string; search?: string; page?: number }) =>
    api.get<PaginatedResponse<SalesAnalysisRow>>('/sales/analysis', { params }),
```

- [ ] **Step 2: Verify the frontend type-checks**

Run: `cd frontend && npm run build -- --mode development 2>&1 | head -50` (or `npx tsc --noEmit` if configured) to confirm no type errors were introduced.
Expected: no TypeScript errors related to `sales.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/sales.ts
git commit -m "feat(sales): add analysis API client method"
```

---

### Task 3: Frontend — Sales Analysis tab UI

**Files:**
- Modify: `frontend/src/pages/SalesPage.tsx`
- Modify: `frontend/src/pages/SalesPage.test.tsx`

**Interfaces:**
- Consumes: `salesApi.analysis` and `SalesAnalysisRow` from Task 2; `locationsApi.list()` (already imported in `SalesPage.tsx:6`).
- Produces: a `SalesAnalysisTab` component rendered when the "Sales Analysis" tab is active. No exports needed outside this file.

- [ ] **Step 1: Write the failing frontend test**

In `frontend/src/pages/SalesPage.test.tsx`, replace the `vi.mock('@/api/sales', ...)` block with:
```ts
vi.mock('@/api/sales', () => ({
  salesApi: {
    list: () => new Promise(() => {}),
    create: vi.fn(),
    revert: vi.fn(),
    analysis: vi.fn(() => Promise.resolve({
      data: {
        data: [
          { product_id: 1, product_name: 'Analysis Product Alpha', quantity_sold: 7, shop: 'All Shops' },
          { product_id: 2, product_name: 'Analysis Product Beta', quantity_sold: 3, shop: 'All Shops' },
        ],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 2 },
      },
    })),
  },
}))
```

Add this test inside the `describe('SalesPage', ...)` block:
```ts
  it('switches to Sales Analysis tab and shows product rows', async () => {
    renderSales()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /sales analysis/i }))

    expect(await screen.findByText('Analysis Product Alpha')).toBeInTheDocument()
    expect(screen.getByText('Analysis Product Beta')).toBeInTheDocument()
  })
```

Add the missing import at the top of the file:
```ts
import userEvent from '@testing-library/user-event'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/SalesPage.test.tsx`
Expected: FAIL — no button named "Sales Analysis" exists yet.

- [ ] **Step 3: Add the tab switcher and `SalesAnalysisTab` component**

In `frontend/src/pages/SalesPage.tsx`:

Add imports (merge into the existing `lucide-react` import and add the new API import):
```ts
import { ChevronDown, ChevronRight, Plus, History, BarChart3 } from 'lucide-react'
import { salesApi, type Sale, type SaleDetail, type SalesAnalysisRow } from '@/api/sales'
```

Add this component after `SaleItems` and before `export default function SalesPage()`:
```tsx
function fmt(n: number) {
  return Number(n).toLocaleString('en-US')
}

function SalesAnalysisTab() {
  const [locationId, setLocationId] = useState<number | ''>('')
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['sales-analysis', locationId, dateFrom, dateTo, search, page],
    queryFn: () => salesApi.analysis({
      location_id: locationId || undefined,
      date_from: dateFrom,
      date_to: dateTo,
      search: search || undefined,
      page,
    }).then(r => r.data),
  })

  const rows: SalesAnalysisRow[] = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="analysis-shop" className="block text-xs font-medium text-gray-500 mb-1">Shop</label>
          <select
            id="analysis-shop"
            value={locationId}
            onChange={e => { setLocationId(e.target.value === '' ? '' : Number(e.target.value)); setPage(1) }}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="">All shops</option>
            {(locationsData ?? []).map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="analysis-from" className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            id="analysis-from"
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="analysis-to" className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            id="analysis-to"
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div>
          <label htmlFor="analysis-search" className="block text-xs font-medium text-gray-500 mb-1">Search product</label>
          <input
            id="analysis-search"
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Product name…"
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No sales found for this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="px-4 py-3 text-right font-medium">Qty Sold</th>
                <th className="px-4 py-3 text-left font-medium">Shop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.product_id}>
                  <td className="px-4 py-3 text-gray-800">{row.product_name}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(row.quantity_sold)}</td>
                  <td className="px-4 py-3 text-gray-600">{row.shop}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {data.meta.current_page} of {data.meta.last_page}</span>
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

Inside `export default function SalesPage()`, add the tab state right after the existing `useState` declarations:
```ts
const [tab, setTab] = useState<'history' | 'analysis'>('history')
```

Replace the opening `<div className="flex items-center justify-between">...</div>` header block's "New Sale" link condition to also require the history tab, and add the tab bar right after it:
```tsx
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Sales</h1>
        {tab === 'history' && (user?.role === 'seller' || user?.role === 'admin') && (
          <Link
            to="/sales/new"
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus size={16} /> New Sale
          </Link>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          ['history',  'History',        History],
          ['analysis', 'Sales Analysis', BarChart3],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
```

Then wrap the existing filters block and history table (everything from `{/* Filters */}` through the closing of the sales `<table>`'s wrapping `</div>`) in `{tab === 'history' && ( ... )}`, and add `{tab === 'analysis' && <SalesAnalysisTab />}` right after that closing `)}`. The revert modal at the bottom stays outside both (it's independent of which tab is active).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/SalesPage.test.tsx`
Expected: PASS (all tests, including the new tab-switch test)

- [ ] **Step 5: Run the full frontend test suite to check for regressions**

Run: `cd frontend && npx vitest run`
Expected: PASS (no regressions elsewhere)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/SalesPage.tsx frontend/src/pages/SalesPage.test.tsx
git commit -m "feat(sales): add Sales Analysis tab to Sales page"
```

---

### Task 4: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the backend and frontend dev servers**

Follow this project's existing local-dev startup (Laravel `php artisan serve` using the Laragon 8.4 PHP binary per project conventions, and `cd frontend && npm run dev`).

- [ ] **Step 2: Click through the golden path**

- Log in, go to Sales, click the "Sales Analysis" tab.
- Confirm the table shows Product / Qty Sold / Shop columns, sorted A–Z, with "All Shops" as the shop value.
- Pick a specific shop in the filter — confirm quantities change and the Shop column now shows that shop's name.
- Change the date range — confirm quantities update.
- Type a partial product name into Search — confirm the list narrows to matching products only.
- If more than 50 products match, confirm Previous/Next pagination works.

- [ ] **Step 3: Check the edge cases**

- Pick a date range with no sales — confirm the "No sales found for this period." empty state appears.
- Confirm switching back to "History" restores the original sales list and the "New Sale" button.

- [ ] **Step 4: Report results**

Note any visual or behavioral issues found; fix before proceeding if anything is broken.

---

### Task 5: Push to `develop`

**Files:** none (git operation only)

- [ ] **Step 1: Push the commits**

```bash
git push origin develop
```

- [ ] **Step 2: Verify Railway deploy**

Check the Railway dashboard (or `railway logs` if the CLI is linked) to confirm the deploy triggered by this push completes successfully with no new migrations required and no errors on boot.
