# Sales Analysis Tab

## Purpose
Add a "Sales Analysis" tab to the Sales page: a per-product breakdown of
units sold over a date range, optionally scoped to one shop and searchable
by product name.

## Scope decisions (confirmed with user)
- **Grouping**: one row per product. The shop filter narrows which sales
  count toward the total — it does not split a product into multiple rows
  per shop. When no shop is selected, the row's `quantity_sold` is the sum
  across all shops.
- **Columns**: exactly `Product`, `Qty Sold`, `Shop` — no revenue or
  category columns.
- **Shop column display**: shows the selected shop's name when a shop
  filter is active, otherwise the literal string `"All Shops"`.
- **Sort order**: product name, A–Z (not by quantity).
- **Reverted sales excluded**: a sale marked `is_reverted = true` restores
  stock (see `RevertSaleController`), so its quantity does not count
  toward `quantity_sold`. This matches the same exclusion already used by
  `PurchaseController::forecast()`'s `avg_daily_sales` calculation.
- **Pagination**: 50 products per page (not a single unbounded list) —
  guards against a large product catalog rendering as one huge table.
- **Access**: same as the existing sales list — `admin`, `store_keeper`,
  `seller` (matches `SalePolicy::viewAny`). No additional per-user shop
  restriction, consistent with how `SaleController::index()` already
  behaves today (any of these three roles can filter by any shop).
- **Placement**: a new tab on the existing `SalesPage.tsx`, alongside the
  current sales-history list — mirrors the "History" / "Forecast" tab
  pattern already used on `PurchasesPage.tsx`.

## Backend

### New route
`GET /sales/analysis` — added to `backend/routes/api.php` **before** the
`apiResource('/sales', SaleController::class)` line (same ordering reason
as `/purchases/forecast`: otherwise `/sales/analysis` would be swallowed
by the `{sale}` route-model-binding parameter and 404).

### New controller method
`SaleController::analysis()` (new method on the existing controller):

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

No RLS/policy changes needed — same reasoning as `purchases/forecast`:
access is gated entirely by `SalePolicy::viewAny`, and `location_id` is an
explicit filter, not a security boundary.

## Frontend

### `frontend/src/api/sales.ts` (modify)
Add:
```ts
export interface SalesAnalysisRow {
  product_id: number
  product_name: string
  quantity_sold: number
  shop: string
}

// added to salesApi:
analysis: (params?: { location_id?: number | ''; date_from?: string; date_to?: string; search?: string; page?: number }) =>
  api.get<PaginatedResponse<SalesAnalysisRow>>('/sales/analysis', { params }),
```

### `frontend/src/pages/SalesPage.tsx` (modify)
Add tabbed navigation ("History" / "Sales Analysis") at the top, mirroring
`PurchasesPage.tsx`'s tab-bar pattern (`frontend/src/pages/PurchasesPage.tsx:165-179`).
The existing sales-history table becomes the "History" tab's content,
unchanged. New `SalesAnalysisTab` component (inline in the same file, same
convention as `ForecastTab` in `PurchasesPage.tsx`):

- Filters row: Shop `<select>` (All shops + list from `locationsApi`),
  Date From / Date To (default: first-of-month → today, matching the
  History tab's existing defaults), Search `<input>` (debounced ~300ms,
  filters by product name server-side).
- Table: **Product | Qty Sold | Shop** columns.
- Pagination: Prev/Next controls, mirroring
  `frontend/src/pages/stock/StockMovementHistoryPage.tsx:83-103`.
- States: loading ("Loading…"), empty ("No sales found for this
  period."), and the normal populated table.

## Tests
New tests in `backend/tests/Feature/Api/SalesTest.php` (or a new
`SalesAnalysisTest.php`):
- Date range filter includes/excludes sales correctly at the boundaries.
- Shop filter narrows `quantity_sold` to that shop's sales only; omitting
  it sums across all shops and returns `shop: "All Shops"`.
- Search filters by partial, case-insensitive product name match.
- A reverted sale's quantity is excluded from `quantity_sold`.
- Results are paginated at 50 per page and sorted by product name A–Z.
- Seller/store_keeper/admin can all access; an unauthenticated or
  unauthorized role cannot (403).

## Out of scope
- No revenue, profit, or category columns — qty sold and shop only, as
  requested.
- No per-shop row splitting — the shop filter narrows the total, it does
  not add a "group by shop" breakdown view.
- No CSV/PDF export — a future enhancement if requested later.

## Deployment
Commit, push to `develop`, verify Railway deploy picks it up
automatically. No new migrations, no new env vars.
