# Admin Dashboard — Asset Value (Shops)

## Purpose
Add an "Asset Value" section to the admin dashboard showing the total TZS
value of stock currently held across all shops, plus a per-shop breakdown —
so admins can see how much inventory value is tied up at each shop at a
glance, alongside the existing Sales/Profit/Expenses breakdowns.

## Calculation
For each shop: `SUM(recent buying price × quantity on hand)` across every
product currently stocked there.

- **Recent buying price** = `products.latest_cost` — already tracked and
  auto-updated by the existing `fn_update_product_latest_cost` DB trigger
  every time a purchase_item is recorded. No new tracking needed.
- **Quantity on hand** = `current_stock` from the existing `v_current_stock`
  view (already joins products × locations with a `latest_cost` column and
  a live stock total per product per location).
- **Negative stock floor**: a shop's per-product stock can occasionally go
  negative (a known, accepted glitch elsewhere in the app — stock sold
  before it was formally distributed). Each product's quantity is floored
  at 0 before valuing, via `GREATEST(current_stock, 0)`, so a data quirk
  never pulls a shop's total below its real value.

## Scope
- **Shops only** (`locations.type = 'shop'`, active) — both the aggregate
  total and the per-shop breakdown. The central store's own (undistributed)
  stock is intentionally excluded; "distributed value" specifically means
  value currently sitting at shops.
- No new tables, migrations, or tracked fields — this is a read-only
  aggregate over data the app already maintains.

## Backend

### `DashboardController::adminData()` (modify)
Add two new queries, following the exact style already used in this method
for `salesTodayByShop`/`profitTodayByShop` (a scalar total via the query
builder, a per-shop breakdown via raw `DB::select`):

```php
$assetValue = (float) DB::table('v_current_stock as cs')
    ->join('locations as l', 'l.id', '=', 'cs.location_id')
    ->where('l.type', 'shop')
    ->where('l.is_active', true)
    ->selectRaw('COALESCE(SUM(GREATEST(cs.current_stock, 0) * cs.latest_cost), 0) as total')
    ->value('total');

$assetValueByShop = DB::select("
    SELECT l.id AS location_id, l.name AS location_name,
           COALESCE(SUM(GREATEST(cs.current_stock, 0) * cs.latest_cost), 0)::numeric AS total
    FROM locations l
    LEFT JOIN v_current_stock cs ON cs.location_id = l.id
    WHERE l.type = 'shop' AND l.is_active = true
    GROUP BY l.id, l.name ORDER BY l.name
");
```

Add to the returned array, using the method's existing `$fmt`/`$fmtShop`
helpers:

```php
'asset_value' => [
    'total'   => $fmt($assetValue),
    'by_shop' => collect($assetValueByShop)->map($fmtShop)->values(),
],
```

No changes to `storeKeeperData()` or `sellerData()` — this is admin-only,
matching the request.

## Frontend

### `frontend/src/api/dashboard.ts` (modify)
Add to `AdminDashboard`:

```ts
asset_value: {
  total: string
  by_shop: ShopBreakdown[]
}
```

### `frontend/src/pages/DashboardPage.tsx` (modify)
Add one more `<BreakdownCard>` in the admin section's existing breakdown
grid, reusing the component already rendering Sales/Profit/Expenses (no new
component needed):

```tsx
<BreakdownCard
  label="Asset Value (Shops)"
  total={dashData.asset_value.total}
  shops={dashData.asset_value.by_shop}
/>
```

## Tests
Extend `backend/tests/Feature/Api/DashboardTest.php` with a case that:
- Creates a store and a shop, a product with a known `latest_cost`, and
  stock movements giving the shop a known quantity on hand.
- Asserts the response has the `asset_value.total` / `asset_value.by_shop`
  structure.
- Looks up the specific shop's entry by `location_id` (not a fixed array
  index — this repo's test DB is shared/not reset between runs, so other
  pre-existing shops may appear in the same response) and asserts its
  `total` equals the expected `latest_cost × quantity`.
- Adds a second product with negative stock at the same shop and confirms
  the shop's total is unaffected (proving the floor-at-zero behavior).
- Does not assert an exact value for the response's overall
  `asset_value.total` (aggregate across all shops in a shared, non-isolated
  test DB is not deterministic) — only the specific shop's computed value.

## Out of scope
- No store/warehouse asset-value card (deferred; shops only, per request).
- No historical/trend view of asset value over time — current snapshot
  only, matching how every other dashboard metric in this method works.
- No export or drill-down UI — same as the existing breakdown cards.

## Deployment
Commit, push to `develop` (per [[project_github]] convention), verify
Railway deploy picks it up automatically. No new env vars or migrations.
