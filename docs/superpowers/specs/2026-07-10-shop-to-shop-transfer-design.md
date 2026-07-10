# Shop-to-Shop Stock Transfer

## Purpose
Let admin/store_keeper move product quantity directly from one shop to
another shop, initiated as a quick action from the Stock page's "Current
Stock" tab. The transfer is recorded as a `pending` distribution, exactly
like an existing store→shop distribution, so it appears in the destination
shop's seller's distribution list for approval via the already-built confirm
flow.

## Why this is new work
The `distributions` table schema (`from_location_id`, `to_location_id`) and
its RLS policies already support any location pair for admin/store_keeper.
The only restriction is in application code:
`DistributionController::store()` hardcodes
`from_location_id = Location::where('type', 'store')->firstOrFail()->id`,
so today a distribution can only ever originate from the single central
store. This feature removes that hardcoding for a new, narrower path (shop
sources only) while leaving the existing store→shop flow (the "New
Distribution" page) completely unchanged when no source is specified.

## Scope decisions
- **Who:** admin and store_keeper — matches `DistributionPolicy::create()`
  and `StoreDistributionRequest::authorize()`, both already
  `in_array($user->role, ['admin', 'store_keeper'])`. No policy changes
  needed.
- **Source restriction:** shops only (`locations.type = 'shop'`, active).
  Moving *from* the central store keeps using the existing "New
  Distribution" page — this feature does not touch or duplicate that flow.
- **Stock validation:** a shop has finite physical stock (unlike the
  central store, which the existing flow never validates against). The
  transfer must be rejected with a 422 if `quantity_sent` exceeds the
  source shop's current stock for that product, checked live against
  `v_current_stock` at submit time (not just client-side).
- **UI shape:** a single-product quick modal opened from the Current Stock
  row (mirrors the existing "Adjust Stock Quantity" modal already in
  `StockPage.tsx`), not the full multi-item "New Distribution" page.

## Backend

### `StoreDistributionRequest` (modify)
Add an optional `from_location_id`:

```php
'from_location_id' => [
    'nullable', 'integer', 'different:to_location_id',
    Rule::exists('locations', 'id')->where(
        fn ($q) => $q->where('type', 'shop')->where('is_active', true)
    ),
],
```

`to_location_id`'s existing `different:from_location_id` rule already
guards the reverse direction.

### `DistributionController::store()` (modify)
- Resolve `$fromLocationId = $validated['from_location_id'] ??
  Location::where('type', 'store')->firstOrFail()->id` — identical fallback
  to today's unconditional behavior when the field is omitted.
- When `from_location_id` was explicitly provided (the new shop-to-shop
  path only — the store-sourced path is intentionally left unvalidated,
  matching its existing behavior), loop `$validated['items']` and check
  each product's live `current_stock` in `v_current_stock` for
  `$fromLocationId`. If `quantity_sent > current_stock` for any item,
  `abort(422, "Insufficient stock for <product>: have <n>, requested <m>.")`
  before opening the DB transaction.
- Replace the two remaining `$store->id` references (the `Distribution`'s
  `from_location_id` and the `distribution_out` `StockMovement`'s
  `location_id`) with `$fromLocationId`.

No new route: this all happens inside the existing `POST /distributions`
endpoint. No RLS or migration changes.

## Frontend

### `frontend/src/api/distributions.ts` (modify)
Add `from_location_id?: number` to `CreateDistributionPayload`.

### `frontend/src/pages/StockPage.tsx` (modify)
- `CurrentStockTable`: accept a new `canTransfer: boolean` prop (passed
  from the page as `user?.role === 'admin' || user?.role === 'store_keeper'`).
  When `canTransfer && row.location_type === 'shop'`, render a "Move" icon
  button in the row (e.g. `ArrowLeftRight` from `lucide-react`) that opens
  a `MoveStockModal` for that row. `stopPropagation()` on the button's
  click so it doesn't also toggle the row's movements-expansion panel.
- New `MoveStockModal` component, defined inline in `StockPage.tsx`
  (matching where `AdjustModal` already lives), props `{ row: StockRow;
  onClose: () => void }`:
  - Fetches `locationsApi.list()`, filters to `type === 'shop' &&
    is_active && id !== row.location_id` for the destination `<select>`.
  - Quantity `<input type="number">`, `min={1}`, client-side capped at
    `row.current_stock` (mirrors `AdjustModal`'s NaN/range guard style).
  - Optional notes field.
  - On submit: `distributionsApi.create({ from_location_id: row.location_id,
    to_location_id, distributed_at: new Date().toISOString(), notes,
    items: [{ product_id: row.product_id, quantity_sent }] })`.
  - `onSuccess`: invalidate `['stock']`, `['stock-low']`,
    `['distributions']`, `['dashboard']` (same set `CreateDistributionPage`
    already invalidates), close modal.
  - `onError`: surface the backend's 422 message (including the
    insufficient-stock case) the same way `AdjustModal` surfaces errors.

No changes to `ConfirmDistributionPage`, `DistributionsPage`,
`DistributionPolicy`, or any RLS policy — the created distribution flows
through the existing confirm/revert/cancel lifecycle untouched.

## Tests
Extend `backend/tests/Feature/Api/DistributionTest.php`:
- Store_keeper can create a shop→shop distribution when the source shop has
  sufficient stock (`status = 'pending'`, `distribution_out` movement
  recorded against the source shop's `location_id`, not the store).
- Creating a shop→shop distribution that exceeds the source shop's current
  stock returns 422.
- Regression: the existing store→shop flow (no `from_location_id` in the
  payload) still creates against the central store unchanged.

## Out of scope
- No UI or backend change to the confirm/revert/cancel distribution
  lifecycle — reused as-is.
- No stock-sufficiency check added to the existing store-sourced
  distribution path (unchanged, matches current accepted behavior).
- No new sidebar entry or route — this is an action within the existing
  Stock page.

## Deployment
Commit, push to `develop` (per [[project_github]] convention), verify
Railway deploy picks it up automatically. No new env vars or migrations.
