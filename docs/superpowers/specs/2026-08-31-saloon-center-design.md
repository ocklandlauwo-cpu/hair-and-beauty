# Saloon Center

## Purpose
Add a new "Saloon Center" business line alongside the existing shop/store
retail operation: logging services rendered (by a provider, for a fee),
managing the providers and service catalog, tracking capital equipment
("tools") bought to support the service, and rolling all of this into the
admin dashboard as a new card section — mirroring the existing Store
section's shape (Sales Today/This Month, Profit Today/This Month, Expenses
This Month, Asset Value).

## Scope decisions (confirmed with user)
- **Center scope**: saloon services happen **at existing shop locations**
  (`locations.type = 'shop'`) — not a new location type, not a single
  company-wide center. The log-sale form has a shop selector (admin) /
  auto-detected shop (seller, same pattern as `SaleController::store`).
- **Services catalog**: admin-manageable (`saloon_services` table), not
  hardcoded — same CRUD shape as the new Providers list.
- **Providers**: `name` + `phone` only, **not** shop-scoped — a provider
  is selectable regardless of which shop the sale is logged at.
- **Profit**: `amount × 0.75`, a flat assumed margin — **not** stored, computed
  in the dashboard query at read time. No cost field on the sale form.
- **Asset Value**: sourced from a new **Saloon Tools** ledger — an
  add-only record of equipment/tool purchases (`name, quantity, unit_cost,
  shop`). Asset Value per shop = `SUM(quantity × unit_cost)`, cumulative,
  no depreciation ("initial capital" as described by the user). Logging a
  tool purchase is **admin only**; the form lives on its own page under
  Settings (not a tab on the Saloon Center page).
- **Expenses**: reuses the existing `expenses` table rather than a new
  one, via a new `business_line` column (`'shop' | 'saloon'`, default
  `'shop'`). This is necessary because the existing "Expenses This Month"
  Store card already sums `expenses` by shop location — without a
  distinguishing column, a naive Saloon Center Expenses card would double
  up with or duplicate the Store card. Existing rows default to `'shop'`,
  so today's Store dashboard numbers are unaffected.
- **No revert** for a logged saloon sale (unlike the main Sales module) —
  out of scope for this pass.
- **No notes/photo field** on a saloon sale — just shop, provider,
  service, amount, date.
- **Saloon Tools has no low-stock/expiry tracking** — pure capital ledger,
  not inventory; no edit/delete once logged (immutable ledger, same
  convention as `purchases`).
- **Roles**:
  - View Saloon Center list, Providers, Saloon Services (read): admin,
    store_keeper, seller — matches `ReconciliationPolicy`/`ClientPolicy`.
  - Log a saloon sale: admin, seller (matches `SalePolicy::create`);
    seller is auto-scoped to their own shop, admin picks any shop.
  - Manage Providers / Saloon Services (add/edit/delete): admin only.
  - View or log a Saloon Tool purchase: admin only, both read and write.
    Unlike Providers/Saloon Services (whose read access is needed by
    seller/admin to populate the Log Sale dropdowns), nothing outside
    Settings ever needs to read the tools ledger, so it's admin-only
    end to end — consistent with it being reachable only via the
    admin-only Settings sidebar group.

## Data model

### New table: `providers`
```php
Schema::create('providers', function (Blueprint $table) {
    $table->id();
    $table->string('name', 100);
    $table->string('phone', 20)->nullable();
    $table->boolean('is_active')->default(true);
    $table->timestamps();
});
```

### New table: `saloon_services`
```php
Schema::create('saloon_services', function (Blueprint $table) {
    $table->id();
    $table->string('name', 100);
    $table->boolean('is_active')->default(true);
    $table->timestamps();
});
```

### New table: `saloon_sales`
```php
Schema::create('saloon_sales', function (Blueprint $table) {
    $table->id();
    $table->foreignId('location_id')->constrained()->restrictOnDelete();
    $table->foreignId('provider_id')->constrained()->restrictOnDelete();
    $table->foreignId('saloon_service_id')->constrained()->restrictOnDelete();
    $table->decimal('amount', 12, 2);
    $table->date('sale_date');
    $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
    $table->timestamps();
});
```

### New table: `saloon_tools`
```php
Schema::create('saloon_tools', function (Blueprint $table) {
    $table->id();
    $table->foreignId('location_id')->constrained()->restrictOnDelete();
    $table->string('name', 150);
    $table->integer('quantity');
    $table->decimal('unit_cost', 12, 2);
    $table->date('purchase_date');
    $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
    $table->timestamps();
});
```

### Altered table: `expenses`
```php
Schema::table('expenses', function (Blueprint $table) {
    $table->enum('business_line', ['shop', 'saloon'])->default('shop');
});
```

### RLS
New migration `enable_rls_for_saloon_center.php` (connection `pgsql_owner`,
same convention as `2026_06_26_095634_enable_rls_and_create_policies.php`):

- `providers`, `saloon_services` — catalog tables, same pattern as
  `categories` (`cat_select` / `cat_write`):
  ```sql
  CREATE POLICY providers_select ON providers FOR SELECT
      USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'));
  CREATE POLICY providers_write ON providers FOR ALL
      WITH CHECK (current_setting('app.role', true) = 'admin');
  -- (same two policies, renamed, for saloon_services)
  ```
- `saloon_sales` — location-scoped, added to the loop using the *exact*
  `$selectUsing`/`$insertCheck` template already defined in
  `2026_06_26_095634_enable_rls_and_create_policies.php:107-116` (seller
  sees/inserts only their own `location_id`, admin/store_keeper see
  all) — same treatment as `sales`/`clients`/`reconciliations`.
- `saloon_tools` — admin-only end to end (matches `SaloonToolPolicy`),
  so it follows the `purchases`/`purchase_items` pattern instead
  (`2026_06_26_095634_enable_rls_and_create_policies.php:71-81`) rather
  than the location-scoped loop:
  ```sql
  CREATE POLICY saloon_tools_select ON saloon_tools FOR SELECT
      USING (current_setting('app.role', true) = 'admin');
  CREATE POLICY saloon_tools_insert ON saloon_tools FOR INSERT
      WITH CHECK (current_setting('app.role', true) = 'admin');
  ```
- No UPDATE/DELETE policies on either table — the app never issues those
  statements against them (no revert, no edit).

## Backend

### Controllers (new)
- `ProviderController` — `index/store/update/destroy`, mirrors
  `ClientController` exactly minus the location-scoping logic (providers
  aren't location-scoped). `destroy()` catches the FK-violation (`23503`)
  the same way `ProductController::destroy()` does, returning a 422 with
  a clear message if a provider has logged sales.
- `SaloonServiceController` — same shape as `ProviderController`, for
  `saloon_services`.
- `SaloonSaleController` — `index/store` only.
  - `index()`: `viewAny` policy check, filters `date_from`/`date_to`
    (default: start of month → today, matching `SaleController::index`)
    and optional `location_id`, paginated, ordered by `sale_date` desc.
    Returns `date, provider_name, service_name, amount, location_name`
    per row (join `providers`, `saloon_services`, `locations`).
  - `store()`: `create` policy check. Validates `location_id` (required
    for admin, ignored/overridden for seller — same pattern as
    `SaleController::store`), `provider_id`, `saloon_service_id`,
    `amount`, `sale_date`. Inserts one `saloon_sales` row.
- `SaloonToolController` — `index/store` only.
  - `index()`: **admin-only** policy check, optional `location_id`
    filter, paginated.
  - `store()`: **admin-only** policy check. Validates `location_id`,
    `name`, `quantity` (integer, min 1), `unit_cost` (numeric, min 0),
    `purchase_date`.

### Policies (new)
- `ProviderPolicy` / `SaloonServicePolicy` — `viewAny`: all three roles;
  `create`/`update`/`delete`: admin only.
- `SaloonSalePolicy` — `viewAny`: all three roles; `create`: admin,
  seller.
- `SaloonToolPolicy` — `viewAny` and `create`: admin only.

### Routes (`backend/routes/api.php`)
```php
Route::apiResource('/providers', ProviderController::class)->only(['index', 'store', 'update', 'destroy']);
Route::apiResource('/saloon-services', SaloonServiceController::class)->only(['index', 'store', 'update', 'destroy']);
Route::apiResource('/saloon-sales', SaloonSaleController::class)->only(['index']);
Route::apiResource('/saloon-tools', SaloonToolController::class)->only(['index']);

Route::middleware('no-dups')->group(function () {
    // ...existing entries...
    Route::post('/saloon-sales', [SaloonSaleController::class, 'store'])->name('saloon-sales.store');
    Route::post('/saloon-tools', [SaloonToolController::class, 'store'])->name('saloon-tools.store');
});
```
(Providers/Saloon Services `store` stay on the plain `apiResource` line —
low-frequency admin actions, same as `clients`/`products`/`categories`,
none of which are in the `no-dups` group.)

### Dashboard (`DashboardController::adminData()`)
New block, same shape as the existing Store block, added to the returned
array as `'saloon' => [...]`:
```php
$saloonSalesToday = (float) DB::table('saloon_sales')->whereDate('sale_date', today())->sum('amount');
$saloonSalesMonth = (float) DB::table('saloon_sales')->whereYear('sale_date', $year)->whereMonth('sale_date', $month)->sum('amount');
$saloonExpensesMonth = (float) DB::table('expenses')
    ->where('business_line', 'saloon')
    ->whereYear('expense_date', $year)->whereMonth('expense_date', $month)
    ->sum('amount');

$saloonSalesTodayByShop = DB::select("
    SELECT l.id AS location_id, l.name AS location_name,
           COALESCE(SUM(ss.amount), 0)::numeric AS total
    FROM locations l
    LEFT JOIN saloon_sales ss ON ss.location_id = l.id AND ss.sale_date::date = CURRENT_DATE
    WHERE l.type = 'shop' AND l.is_active = true
    GROUP BY l.id, l.name ORDER BY l.name
");
// ...saloonSalesMonthByShop, saloonExpensesMonthByShop, saloonAssetValueByShop
// follow the exact same per-shop query shape as the existing Store block
// (see PurchaseController::forecast / DashboardController's existing
// *ByShop queries), swapping `sales`/`expenses` for `saloon_sales` /
// `expenses WHERE business_line = 'saloon'` / `saloon_tools`, and always
// filtering `l.type = 'shop'`.

$saloonAssetValue = (float) DB::table('saloon_tools')
    ->join('locations', 'locations.id', '=', 'saloon_tools.location_id')
    ->where('locations.type', 'shop')->where('locations.is_active', true)
    ->selectRaw('COALESCE(SUM(quantity * unit_cost), 0) as total')->value('total');

return [
    // ...existing keys...
    'saloon' => [
        'sales' => [
            'today' => $fmt($saloonSalesToday), 'today_by_shop' => ...,
            'this_month' => $fmt($saloonSalesMonth), 'this_month_by_shop' => ...,
        ],
        'profit' => [
            'today' => $fmt($saloonSalesToday * 0.75), 'today_by_shop' => [...(amount * 0.75) per shop...],
            'this_month' => $fmt($saloonSalesMonth * 0.75), 'this_month_by_shop' => [...],
        ],
        'expenses' => ['this_month' => $fmt($saloonExpensesMonth), 'this_month_by_shop' => ...],
        'asset_value' => ['total' => $fmt($saloonAssetValue), 'by_shop' => ...],
    ],
];
```
Profit-by-shop rows are the sales-by-shop rows with `total` multiplied by
`0.75` (computed in PHP after the sales-by-shop query, no separate SQL
needed).

## Frontend

### Sidebar (`Sidebar.tsx`)
- New flat link `{ kind: 'link', to: '/saloon-center', label: 'Saloon Center', icon: Scissors, roles: ['admin', 'store_keeper', 'seller'] }`,
  inserted immediately after the Reconciliation entry.
- Settings group (admin only) gains three children: "Providers"
  (`/providers`), "Saloon Services" (`/saloon-services`), "Saloon Tools"
  (`/saloon-tools`).

### `/saloon-center` — `SaloonCenterPage.tsx`
- List: Date | Provider | Service | Amount (TZS), paginated, with the
  same Shop + date-range filters as `SalesPage.tsx`'s History tab.
- "Log Sale" button opens a modal (same pattern as `AddAskedProductModal`
  in `ProductsPage.tsx`): Shop selector (admin only — hidden for seller,
  whose own shop is used automatically), Provider dropdown (active
  providers), Service dropdown (active services), Amount input, Date
  (defaults to today), Submit.

### `/providers`, `/saloon-services` — CRUD pages
Mirror `ClientsPage.tsx`'s structure minus the shop-scoping logic: a
`DataTable` list (Name, Phone for Providers / Name for Services, Status,
admin-only Edit/Delete actions) + an add/edit modal, admin-only create
button.

### `/saloon-tools` — `SaloonToolsPage.tsx`
Admin-only page: `DataTable` list (Date, Shop, Item, Quantity, Unit Cost,
Total) + an add-only form (Shop, Name, Quantity, Unit Cost, Date). No
edit/delete actions in the table.

### Dashboard (`DashboardPage.tsx`)
New "Saloon Center" heading + a second `grid grid-cols-1 sm:grid-cols-2`
block of `BreakdownCard`s, placed directly after the existing Store grid,
using `dashData.saloon.*` — same six-card shape (Sales Today, Sales This
Month, Profit Today, Profit This Month, Expenses This Month, Asset
Value), reusing the existing `BreakdownCard` component as-is.

### `ExpensesPage.tsx`
Add a "Business Line" selector (Shop / Saloon Center) to the existing
expense-logging form, submitted as `business_line` alongside the current
fields. Defaults to "Shop" (preserves current behavior when unset).

## Tests
New Pest feature tests:
- `ProviderTest.php` / `SaloonServiceTest.php` — CRUD + admin-only
  write, FK-violation-caught delete when referenced by a sale.
- `SaloonSaleTest.php` — seller auto-scoped to own shop; admin can target
  any shop; date-range and shop filters on `index()`; store_keeper cannot
  create a sale (403); RLS confirms a seller only sees their own shop's
  rows via `index()`.
- `SaloonToolTest.php` — admin-only for both list and create (403 for
  seller/store_keeper on each); total reflects `quantity × unit_cost`.
- `DashboardSaloonTest.php` — the new `saloon` block's numbers: sales
  today/this month, profit = 75% of sales, expenses filtered to
  `business_line = 'saloon'` only (a `'shop'` expense in the same month
  must NOT appear in the saloon figure), asset value = sum of tool
  purchases.
- Extend the existing expenses test file: an expense with no
  `business_line` specified defaults to `'shop'` and appears in the
  Store Expenses card, not the Saloon one.

New Vitest frontend tests, following the existing per-page pattern
(`ClientsPage.test.tsx`, `SalesPage.test.tsx`): render + role-gating for
`SaloonCenterPage`, `ProvidersPage`, `SaloonServicesPage`,
`SaloonToolsPage`, and a `DashboardPage` update covering the new Saloon
section renders when `dashData.saloon` is present.

## Out of scope
- No revert/undo for a logged saloon sale.
- No notes or attachments on a saloon sale.
- No low-stock/expiry tracking for Saloon Tools — pure capital ledger.
- No edit/delete for Saloon Tools entries once logged.
- No per-provider or per-service reporting/analytics beyond the raw list
  (a future "Saloon Analysis" tab, mirroring the existing Sales Analysis
  tab, would be a natural follow-up but isn't part of this pass).
- No changes to the existing Store dashboard queries beyond what's
  structurally required to keep Saloon Center numbers independent (the
  `business_line` column on `expenses`).

## Deployment
New migrations run automatically on the next Railway deploy (standard
Laravel migration-on-deploy, same as every prior feature in this
project). No manual data backfill needed — `business_line` defaults to
`'shop'` for all existing expense rows, so current dashboard numbers are
unchanged until someone logs a Saloon Center expense.
