# Purchase Forecast — Estimated Quantity Needed

## Purpose
Add a "Forecast" tab to the Purchases page: for a selected shop and a
selected horizon (2–12 months), estimate how many units of each product
the shop will need to buy, based on that shop's own recent sales history
and current stock on hand.

## Method (confirmed with user)
Reuses this app's existing demand-estimation convention — already used by
`v_low_stock_alerts` (`backend/database/migrations/2026_06_29_124712_fix_stock_views_security_invoker.php:65-69`):

```
avg_daily_sales = SUM(quantity sold in the last 90 days) / 90
```

No new forecasting method is introduced (no seasonality, no trend
extrapolation) — this keeps the estimate consistent with how the rest of
the app already reasons about demand (see also the "Fastest Selling
Products" AI report's velocity metric, which uses the same
sales-per-elapsed-day style of calculation).

Projected consumption over the selected horizon:
```
projected_need = avg_daily_sales × 30 × months
```

Suggested purchase quantity (confirmed: subtract stock on hand, floor at zero):
```
suggested_purchase_qty = GREATEST(projected_need − current_stock, 0)
```

**Products with zero sales in the last 90 days are included** (confirmed
with user), showing `avg_daily_sales = 0`, `projected_need = 0`, and
`suggested_purchase_qty = 0` (never negative) — giving a complete picture
of every active product at the shop, not just ones with recent history.

## Scope decisions
- **Shop selector**: any active `type = 'shop'` location — matches "on a
  specific shop" literally. This is a planning/analysis view, independent
  of how purchase intake itself is recorded (purchases are always
  recorded against the central store today, per the existing
  `PurchaseController::store()` — unchanged by this feature).
- **Months selector**: 2 through 12 inclusive.
- **Access**: admin and store_keeper — matches `PurchasePolicy` exactly
  (`viewAny`/`view`/`create` are all `in_array($user->role, ['admin',
  'store_keeper'])`; seller has no Purchases access at all, unaffected).
- **Placement**: a new tab on the existing `PurchasesPage.tsx`, alongside
  the current purchase-history list — mirrors the tabbed pattern already
  used on the Products and Stock pages this session.

## Backend

### New route
`GET /purchases/forecast?location_id=&months=` — added to
`backend/routes/api.php` directly after the existing `/purchases`
`apiResource` line.

### New controller method (or dedicated controller)
`PurchaseController::forecast()` (single new method on the existing
controller, since it's the same resource):

```php
public function forecast(Request $request): JsonResponse
{
    $this->authorize('viewAny', Purchase::class);

    $request->validate([
        'location_id' => ['required', 'integer', 'exists:locations,id'],
        'months'      => ['required', 'integer', 'min:2', 'max:12'],
    ]);

    $locationId = $request->integer('location_id');
    $months     = $request->integer('months');

    $rows = DB::select("
        WITH avg_sales AS (
            SELECT si.product_id, SUM(si.quantity)::decimal / 90 AS avg_daily
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.location_id = ? AND s.sale_date >= CURRENT_DATE - 90 AND s.is_reverted = false
            GROUP BY si.product_id
        ),
        stock AS (
            SELECT product_id, current_stock FROM v_current_stock WHERE location_id = ?
        )
        SELECT
            p.id                                                                       AS product_id,
            p.name                                                                     AS product_name,
            cat.name                                                                   AS category_name,
            ROUND(COALESCE(av.avg_daily, 0), 2)                                        AS avg_daily_sales,
            COALESCE(st.current_stock, 0)                                              AS current_stock,
            ROUND(COALESCE(av.avg_daily, 0) * 30 * ?)::integer                         AS projected_need,
            GREATEST(ROUND(COALESCE(av.avg_daily, 0) * 30 * ?)::integer - COALESCE(st.current_stock, 0), 0) AS suggested_purchase_qty
        FROM products p
        LEFT JOIN categories cat ON cat.id = p.category_id
        LEFT JOIN avg_sales av ON av.product_id = p.id
        LEFT JOIN stock st ON st.product_id = p.id
        WHERE p.is_active = true
        ORDER BY suggested_purchase_qty DESC
    ", [$locationId, $locationId, $months, $months]);

    return response()->json(['data' => $rows]);
}
```

No RLS/policy changes needed — `sale_items`/`sales` already carry the
existing RLS enforced on the connection; since only admin/store_keeper can
reach this endpoint (both unrestricted by location under the app's RLS
policies), no additional location-scoping guard is needed beyond the
explicit `location_id` filter already in the query.

## Frontend

### `frontend/src/api/purchases.ts` (modify)
Add:
```ts
export interface ForecastRow {
  product_id: number
  product_name: string
  category_name: string | null
  avg_daily_sales: string
  current_stock: number
  projected_need: number
  suggested_purchase_qty: number
}

// added to purchasesApi:
forecast: (locationId: number, months: number) =>
  api.get<{ data: ForecastRow[] }>('/purchases/forecast', { params: { location_id: locationId, months } }),
```

### `frontend/src/pages/PurchasesPage.tsx` (modify)
Add tabbed navigation ("History" / "Forecast") at the top, mirroring
`ProductsPage.tsx`'s tab-bar pattern. The existing purchase-history table
becomes the "History" tab's content, unchanged. New "Forecast" tab:
- Shop `<select>` (active shops only) + months `<select>` (2–12).
- Table: Product, Category, Avg Daily Sales, Current Stock, Projected
  Need, **Suggested Purchase Qty** (bold, sorted highest first — already
  sorted server-side).
- Empty state before a shop is selected: "Select a shop to see its
  purchase forecast."

## Tests
New `backend/tests/Feature/Api/PurchaseForecastTest.php`:
- A shop with sales history returns correct `avg_daily_sales`,
  `projected_need`, and `suggested_purchase_qty` for a known fixture
  (e.g. 90 units sold over 90 days = avg_daily 1.0; 3-month horizon =
  projected_need 90; stock 20 on hand = suggested_purchase_qty 70).
- A product with zero sales at that shop still appears, with all three
  computed columns at 0.
- `suggested_purchase_qty` never goes negative when stock exceeds
  projected need.
- Seller cannot access the endpoint (403).
- `months` outside 2–12 is rejected (422).

## Out of scope
- No seasonality/trend adjustment — flat trailing-90-day average only,
  matching the rest of the app's existing convention.
- No auto-creation of a purchase/draft from the forecast — this is a
  read-only planning view; recording an actual purchase still goes
  through the existing "Record Purchase" flow, manually informed by this
  tab's numbers.
- No per-shop purchase intake changes — purchases are still always
  recorded against the central store, unchanged.

## Deployment
Commit, push to `develop`, verify Railway deploy picks it up
automatically. No new migrations, no new env vars.
