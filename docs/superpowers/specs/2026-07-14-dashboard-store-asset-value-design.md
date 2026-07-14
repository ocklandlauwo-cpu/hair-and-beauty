# Admin Dashboard — Store Asset Value

## Purpose
Extend the just-shipped "Asset Value" dashboard section with the central
store's own stock value, alongside the existing shops-only figure — so
admins see the value of inventory sitting at the warehouse in addition to
what's already distributed to shops.

## Relationship to the existing feature
This is additive, not a rework. The already-shipped `asset_value` field
(`total` + `by_shop`, shops only) stays exactly as-is — this adds a new
sibling field, `store_asset_value` (`total` + `by_location`), computed the
same way but filtered to `locations.type = 'store'` instead of `'shop'`.
Minimizes risk to the feature that's already live.

## Calculation
Identical method to the shops figure: for each store location,
`SUM(GREATEST(current_stock, 0) × latest_cost)` across every product
stocked there, using the same `v_current_stock` view and
`products.latest_cost` field already in use.

- Computed per-location (not hardcoded to a single store row) so it stays
  correct even though today's data model has exactly one active store —
  this mirrors the generality already used for the shops query.
- Same negative-stock floor (`GREATEST(current_stock, 0)`) for the same
  reason as the shops figure.

## Backend

### `DashboardController::adminData()` (modify)
Add two more queries directly after the existing `$assetValueByShop` query
block, mirroring it exactly except for the `type` filter:

```php
$storeAssetValue = (float) DB::table('v_current_stock as cs')
    ->join('locations as l', 'l.id', '=', 'cs.location_id')
    ->where('l.type', 'store')
    ->where('l.is_active', true)
    ->selectRaw('COALESCE(SUM(GREATEST(cs.current_stock, 0) * cs.latest_cost), 0) as total')
    ->value('total');

$storeAssetValueByLocation = DB::select("
    SELECT l.id AS location_id, l.name AS location_name,
           COALESCE(SUM(GREATEST(cs.current_stock, 0) * cs.latest_cost), 0)::numeric AS total
    FROM locations l
    LEFT JOIN v_current_stock cs ON cs.location_id = l.id
    WHERE l.type = 'store' AND l.is_active = true
    GROUP BY l.id, l.name ORDER BY l.name
");
```

Add a new `'store_asset_value'` key to the returned array, directly after
the existing `'asset_value'` key:

```php
'store_asset_value' => [
    'total'       => $fmt($storeAssetValue),
    'by_location' => collect($storeAssetValueByLocation)->map($fmtShop)->values(),
],
```

Reuses the method's existing `$fmt`/`$fmtShop` closures — no new helpers.

## Frontend

### `frontend/src/api/dashboard.ts` (modify)
Add to `AdminDashboard`, directly after `asset_value`:

```ts
store_asset_value: {
  total: string
  by_location: ShopBreakdown[]
}
```

`ShopBreakdown` is reused as-is (its fields, `location_id`/`location_name`/
`total`, are already location-generic).

### `frontend/src/pages/DashboardPage.tsx` (modify)
Add one more `<BreakdownCard>` directly after the existing "Asset Value
(Shops)" card:

```tsx
<BreakdownCard
  label="Asset Value (Store)"
  total={dashData.store_asset_value.total}
  shops={dashData.store_asset_value.by_location}
/>
```

## Tests
Extend `backend/tests/Feature/Api/DashboardTest.php` with one case
mirroring the existing shop asset-value test: a store location with a
product of known `latest_cost` and known stock, asserting
`store_asset_value.by_location`'s entry for that store equals the expected
value, looked up by `location_id` (not a fixed array index, for the same
shared-test-DB reason as the existing test).

## Out of scope
- No merge of `asset_value` and `store_asset_value` into one unified
  structure — kept as two sibling fields to avoid touching the
  already-shipped shops feature.
- No UI grouping/section header beyond placing the two cards adjacently in
  the existing grid.

## Deployment
Commit, push to `develop`, verify Railway deploy picks it up
automatically. No new env vars or migrations.
