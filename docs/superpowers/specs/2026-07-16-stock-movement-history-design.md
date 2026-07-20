# Stock Movement History — Preview Cap + Full History Page

## Purpose
Cap the Current Stock tab's inline movements preview to the last 7
transactions (already sorted descending by date — that part is unchanged),
and add a dedicated, paginated page for viewing a product's complete
movement history at a specific shop.

## Current state
`StockController::movements()` (`GET /stock/movements`) already orders by
`created_at DESC` and returns up to 200 rows. `StockPage.tsx`'s
`MovementsPanel` (the inline expansion under each Current Stock row)
fetches and renders all of them with no further limiting. The only actual
change requirement 1 needs is lowering that cap — ordering is already
correct.

## Scope decisions (confirmed with user)
1. Keep the inline 7-row preview AND add a full-history page — not a
   replacement. The preview stays for quick glances; a "View Full History"
   link opens the full page.
2. The full-history page shows every movement type (purchase, distribution
   in/out, sale, sale revert, adjustment) — same scope as today's panel,
   not narrowed to sales only.
3. The full-history page paginates, matching every other list page in this
   app (Products, Clients, Distributions, Sales).

## Backend

### `StockController::movements()` (modify)
Change `->limit(200)` to `->limit(7)`. No other change — `orderByDesc(
'created_at')` already gives descending order.

### `StockController::movementsHistory()` (new method)
```php
public function movementsHistory(Request $request): JsonResponse
{
    $request->validate([
        'product_id'  => ['required', 'integer', 'exists:products,id'],
        'location_id' => ['required', 'integer', 'exists:locations,id'],
    ]);

    $productId  = $request->integer('product_id');
    $locationId = $request->integer('location_id');
    $perPage    = min((int) ($request->query('per_page') ?? 50), 200);

    $movements = StockMovement::where('product_id', $productId)
        ->where('location_id', $locationId)
        ->orderByDesc('created_at')
        ->paginate($perPage, ['id', 'movement_type', 'quantity', 'created_at']);

    return response()->json([
        'data' => $movements->items(),
        'meta' => [
            'current_page'  => $movements->currentPage(),
            'last_page'     => $movements->lastPage(),
            'per_page'      => $movements->perPage(),
            'total'         => $movements->total(),
            'product_name'  => DB::table('products')->where('id', $productId)->value('name'),
            'location_name' => DB::table('locations')->where('id', $locationId)->value('name'),
        ],
    ]);
}
```
`product_name`/`location_name` ride along in `meta` so the frontend page
can render a header without a second request. No new authorization logic:
this table already has RLS (`stock_movements_select` — admin/store_keeper
unrestricted, seller scoped to their own `location_id` via the
`app.location_ids` GUC), and the existing `movements()` endpoint already
relies on that same RLS with no controller-side role check — this new
method follows the identical, already-proven pattern.

### Route (add to `backend/routes/api.php`)
```php
Route::get('/stock/movements/history', [StockController::class, 'movementsHistory'])->name('stock.movements.history');
```
Placed directly after the existing `/stock/movements` route.

## Frontend

### `frontend/src/api/stock.ts` (modify)
- Move `MOVEMENT_META` (currently defined inline in `StockPage.tsx`) into
  this file as an exported const, so both `MovementsPanel` and the new
  history page can import the same lookup instead of duplicating it.
- Add `movementsHistory(productId, locationId, page = 1)` and a
  `StockMovementHistoryResponse` type (`data: StockMovement[]`, `meta`
  extending the standard pagination shape with `product_name: string |
  null` and `location_name: string | null`).

### `frontend/src/pages/stock/StockMovementHistoryPage.tsx` (new)
Route: `/stock/history/:productId/:locationId` — path params, matching
this app's existing `/products/:id/edit` pattern. Open to all authenticated
roles (same accessibility as the Stock page itself — no `RoleRoute`
wrapper; sellers are already scoped to their own shop by the same RLS the
preview panel relies on).

- Header: "Movement History — {product_name} at {location_name}" (from
  the response `meta`), with a back link to Stock.
- Full paginated table, all movement types, same badge styling as the
  existing panel (imported `MOVEMENT_META`).
- Standard Previous/Next pagination controls, matching the style already
  used on Products/Clients/Distributions.

### `frontend/src/pages/StockPage.tsx` (modify)
- Import `MOVEMENT_META` from `@/api/stock` instead of defining it inline;
  remove the local definition.
- `MovementsPanel`: after the table, when `data.length > 0`, render a
  "View Full History →" link (`react-router-dom` `Link`) to
  `/stock/history/${productId}/${locationId}`.

### `frontend/src/router.tsx` (modify)
Add `{ path: 'stock/history/:productId/:locationId', element:
<StockMovementHistoryPage /> }` to the "All authenticated roles" section
(alongside `stock`), not inside any `RoleRoute` block.

## Tests
New `backend/tests/Feature/Api/StockMovementsTest.php` (no existing
dedicated test file for this controller):
- `movements()` (the preview endpoint) returns at most 7 rows, ordered
  descending by `created_at`, when more than 7 movements exist for a
  product/location.
- `movementsHistory()` returns all movements across multiple pages
  (paginated correctly), with `meta.product_name`/`meta.location_name`
  populated.
- A seller cannot see another shop's movement history via
  `movementsHistory()` (RLS-scoped — mirrors the existing, already-proven
  scoping behavior for `movements()`).

## Out of scope
- No filtering (by date range, movement type, etc.) on the full-history
  page — just the complete, paginated ledger.
- No export/CSV action.
- No change to how movements are created — this is read-only.

## Deployment
Commit, push to `develop`, verify Railway deploy picks it up
automatically. No new migrations, no new env vars.
