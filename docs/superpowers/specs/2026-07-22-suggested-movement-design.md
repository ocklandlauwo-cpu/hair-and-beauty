# Suggested Movement — Shop-to-Shop Stock Rebalancing

## Purpose
Add a "Suggested Movement" tab to the Distributions page: identify products
where one shop is sitting on stock it doesn't need soon while another shop
is running low, and suggest a specific shop-to-shop transfer to rebalance
them — based on each shop's own recent sales history and stock on hand.

## Method (confirmed with user)

Reuses this app's existing demand-estimation convention — the same one used
by `v_low_stock_alerts` and the Purchase Forecast tab
(`backend/database/migrations/2026_06_29_124712_fix_stock_views_security_invoker.php:65-69`):

```
avg_daily_sales = SUM(quantity sold in the last 90 days) / 90
```

No new forecasting method is introduced — this keeps the estimate
consistent with how the rest of the app already reasons about demand.

### Per-shop classification

Computed per `(product, shop)` pair, for active `type = 'shop'` locations
only (the central store is excluded — this feature is shop-to-shop by
definition; store→shop replenishment is already covered by Purchase
Forecast and the existing Distribution "from store" flow):

```
days_of_cover = current_stock / avg_daily_sales   (undefined when avg_daily_sales = 0)
```

- **Deficit** shop: `avg_daily_sales > 0 AND days_of_cover <= 15` (0.5
  months) — includes out-of-stock-with-active-demand (`current_stock = 0`
  gives `days_of_cover = 0`, which qualifies).
- **Surplus** shop: `current_stock > 0 AND (avg_daily_sales = 0 OR
  days_of_cover >= 60)` (2 months) — a shop holding stock of a product it
  never sells is the strongest possible surplus signal, so zero-demand
  shops with stock qualify unconditionally.
- Shops with `0.5 < days_of_cover < 2` months (or with no stock and no
  demand) are balanced — no suggestion involves them.

### Matching (confirmed: one suggestion per product, not full N:M)

For each product with **at least one deficit shop and at least one
surplus shop**, pick a single pair:
- **Source** = the surplus shop with the highest `days_of_cover` (treat
  zero-demand-with-stock as the highest priority / effectively infinite
  cover).
- **Destination** = the deficit shop with the lowest `days_of_cover`
  (out-of-stock ranks most urgent).

If a product has multiple surplus or multiple deficit shops, only the most
extreme pair on each side is used — remaining imbalances simply don't
generate a row this run. (Confirmed acceptable for v1; not a bug, a scope
decision.)

### Suggested quantity

Targets a 1-month buffer at both ends (the midpoint between the 0.5-month
deficit and 2-month surplus thresholds):

```
target_source     = avg_daily_sales_source × 30 × 1
excess_source     = current_stock_source − target_source

target_dest       = avg_daily_sales_dest × 30 × 1
shortfall_dest     = target_dest − current_stock_dest

suggested_qty = GREATEST(LEAST(excess_source, shortfall_dest), 0)
```

Given the deficit/surplus thresholds, `excess_source` and `shortfall_dest`
are always positive for a qualifying pair, so the `GREATEST(..., 0)` floor
is a safety net rather than a load-bearing case (kept for consistency with
Purchase Forecast's identical pattern and defensive correctness).

Products with zero sales at **every** shop are excluded entirely — no
demand signal anywhere means no deficit can exist, so no pair can form.

## Scope decisions
- **Shops only**: active `type = 'shop'` locations, both as source and
  destination. The central store is never a candidate (matches "from one
  shop to another" literally).
- **One suggestion per product**: biggest-surplus shop → most-urgent-
  deficit shop. No multi-shop greedy allocation in v1.
- **Read-only**: no "Create Distribution" quick-action in v1 — matches the
  Purchase Forecast tab's precedent (also explicitly out-of-scope for
  auto-creation). Staff review the table and use the existing "New
  Distribution" form manually if they act on a suggestion.
- **No shop/product selector**: this is inherently a cross-shop,
  all-products view — unlike Purchase Forecast (which is scoped to one
  shop at a time), there's nothing meaningful to filter by upfront.
- **Access**: admin and store_keeper — matches `DistributionPolicy::create`
  (`backend/app/Policies/DistributionPolicy.php:15-18`), since these are
  the roles who would act on a suggestion by creating a transfer. Sellers
  keep their existing `viewAny` access to their own distributions but do
  not see this cross-shop comparison view.
- **Placement**: a new tab on the existing `DistributionsPage.tsx`,
  alongside the current distribution list — mirrors the tabbed pattern
  used on Products, Stock, and Purchases pages.

## Backend

### New route
`GET /distributions/suggested-movements` — no query params, computed
across all shops in one response. Must be registered in
`backend/routes/api.php` **before**
`Route::apiResource('/distributions', DistributionController::class)->only(['index', 'show'])`
(currently line 76): both are 2-segment paths (`/distributions/{x}` vs.
`/distributions/suggested-movements`), and Laravel matches route
registration order — the same gotcha already fixed for
`/purchases/forecast` vs. the `/purchases` resource. The literal route
must come first or the resource's `{distribution}` wildcard will swallow
it and attempt `Distribution::findOrFail('suggested-movements')`, 404-ing.

### New controller method
`DistributionController::suggestedMovements()`. The per-product
source/destination selection (biggest surplus, most urgent deficit) is a
small group-and-sort over per-shop rows — done in PHP after one SQL query
fetches the raw per-`(product, shop)` stats, rather than forcing the
pairing logic into SQL:

```php
public function suggestedMovements(): JsonResponse
{
    $this->authorize('create', Distribution::class);

    $rows = DB::select("
        WITH avg_sales AS (
            SELECT si.product_id, s.location_id, SUM(si.quantity)::decimal / 90 AS avg_daily
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.sale_date >= CURRENT_DATE - 90 AND s.is_reverted = false
            GROUP BY si.product_id, s.location_id
        )
        SELECT
            p.id AS product_id,
            p.name AS product_name,
            cat.name AS category_name,
            l.id AS location_id,
            l.name AS location_name,
            COALESCE(av.avg_daily, 0) AS avg_daily_sales,
            COALESCE(cs.current_stock, 0) AS current_stock
        FROM products p
        LEFT JOIN categories cat ON cat.id = p.category_id
        CROSS JOIN locations l
        LEFT JOIN avg_sales av ON av.product_id = p.id AND av.location_id = l.id
        LEFT JOIN v_current_stock cs ON cs.product_id = p.id AND cs.location_id = l.id
        WHERE p.is_active = true AND l.is_active = true AND l.type = 'shop'
          AND (COALESCE(av.avg_daily, 0) > 0 OR COALESCE(cs.current_stock, 0) > 0)
    ");

    $byProduct = collect($rows)->groupBy('product_id');
    $suggestions = [];

    foreach ($byProduct as $productRows) {
        $deficits = [];
        $surpluses = [];

        foreach ($productRows as $r) {
            $avgDaily = (float) $r->avg_daily_sales;
            $stock = (int) $r->current_stock;
            $daysOfCover = $avgDaily > 0 ? $stock / $avgDaily : null;

            if ($avgDaily > 0 && $daysOfCover <= 15) {
                $deficits[] = ['row' => $r, 'days' => $daysOfCover];
            } elseif ($stock > 0 && ($avgDaily === 0.0 || $daysOfCover >= 60)) {
                $surpluses[] = ['row' => $r, 'days' => $daysOfCover]; // null sorts as "infinite"
            }
        }

        if (! $deficits || ! $surpluses) {
            continue;
        }

        // Most urgent deficit = lowest days_of_cover; biggest surplus = highest (null/infinite first)
        usort($deficits, fn ($a, $b) => $a['days'] <=> $b['days']);
        usort($surpluses, fn ($a, $b) => ($b['days'] ?? PHP_FLOAT_MAX) <=> ($a['days'] ?? PHP_FLOAT_MAX));

        $dest = $deficits[0]['row'];
        $src = $surpluses[0]['row'];

        $targetSrc = (float) $src->avg_daily_sales * 30;
        $excessSrc = (float) $src->current_stock - $targetSrc;

        $targetDest = (float) $dest->avg_daily_sales * 30;
        $shortfallDest = $targetDest - (float) $dest->current_stock;

        $qty = (int) round(max(min($excessSrc, $shortfallDest), 0));

        if ($qty > 0) {
            $suggestions[] = [
                'product_id' => (int) $src->product_id,
                'product_name' => $src->product_name,
                'category_name' => $src->category_name,
                'from_location_id' => (int) $src->location_id,
                'from_location_name' => $src->location_name,
                'from_days_of_cover' => $surpluses[0]['days'] !== null ? round($surpluses[0]['days']) : null,
                'to_location_id' => (int) $dest->location_id,
                'to_location_name' => $dest->location_name,
                'to_days_of_cover' => round($deficits[0]['days']),
                'suggested_qty' => $qty,
            ];
        }
    }

    usort($suggestions, fn ($a, $b) => $b['suggested_qty'] <=> $a['suggested_qty']);

    return response()->json(['data' => array_values($suggestions)]);
}
```

Notes on the query: the `CROSS JOIN locations` (filtered to active shops)
combined with the `WHERE (avg_daily > 0 OR current_stock > 0)` guard keeps
the row count bounded to only `(product, shop)` pairs with some signal
(sold there recently, or currently stocked there) — avoiding a full
`products × shops` cross product for shops/products with neither.

No RLS/policy changes needed — admin/store_keeper are unrestricted by
location under the app's existing RLS policies, matching the same
reasoning already documented for Purchase Forecast.

## Frontend

### `frontend/src/api/distributions.ts` (modify)
Add:
```ts
export interface SuggestedMovement {
  product_id: number
  product_name: string
  category_name: string | null
  from_location_id: number
  from_location_name: string
  from_days_of_cover: number | null
  to_location_id: number
  to_location_name: string
  to_days_of_cover: number
  suggested_qty: number
}

// added to distributionsApi:
suggestedMovements: () =>
  api.get<{ data: SuggestedMovement[] }>('/distributions/suggested-movements'),
```

### `frontend/src/pages/DistributionsPage.tsx` (modify)
Add tabbed navigation ("History" / "Suggested Movement") at the top,
mirroring the Purchases page's tab-bar pattern. The existing distribution
list (search, expandable rows, cancel/revert modals) becomes the
"History" tab's content, unchanged. New "Suggested Movement" tab:
- No filters — table loads immediately (`useQuery`, no `enabled` gate).
- Table: Product, Category, From Shop (+ days of cover, or "no recent
  sales" when `from_days_of_cover` is `null`), To Shop (+ days of cover),
  **Suggested Qty** (bold, sorted highest first — already sorted
  server-side).
- Empty state: "No rebalancing suggestions right now — stock levels look
  balanced across shops."
- "New Distribution" button/link stays visible only on the History tab
  (matches the Purchase Forecast tab's "Record Purchase" gating pattern).

## Tests
New `backend/tests/Feature/Api/SuggestedMovementsTest.php`:
- A product with one clear deficit shop (e.g. 0 stock, avg_daily 1.0 →
  days_of_cover 0) and one clear surplus shop (e.g. avg_daily 0.1, stock
  100 → days_of_cover 1000) returns a suggestion with the correct
  `from_location_id`/`to_location_id` and a `suggested_qty` matching the
  hand-computed formula.
- A product where all shops are "balanced" (days_of_cover between 15 and
  60... i.e. between 0.5 and 2 months) produces no suggestion for that
  product.
- A product with a surplus shop but no deficit shop anywhere produces no
  suggestion (no pair can form).
- A zero-demand-everywhere product (no sales at any shop, regardless of
  stock) produces no suggestion.
- A product with two surplus shops and one deficit shop: confirm only the
  single biggest-surplus shop is chosen as source (proves the "one
  suggestion per product" matching rule, not both).
- Seller cannot access the endpoint (403) — `DistributionPolicy::create`
  is admin/store_keeper only.

## Out of scope
- No multi-shop greedy allocation — one pair per product only, as decided.
- No "Create Distribution" quick-action / pre-fill — read-only table,
  matching the Purchase Forecast precedent.
- No shop or category filter/selector — the view is global by design.
- No auto-creation of a distribution from a suggestion — recording an
  actual transfer still goes through the existing "New Distribution" flow,
  manually informed by this tab's numbers.
- Central store is never a source or destination in this feature — store↔
  shop movement is already covered by Purchase Forecast (buying) and the
  existing Distribution "from store" flow (initial stocking).

## Deployment
Commit, push to `develop`, verify Railway deploy picks it up
automatically. No new migrations, no new env vars.
