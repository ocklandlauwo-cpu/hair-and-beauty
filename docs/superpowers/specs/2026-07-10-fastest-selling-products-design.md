# Fastest Selling Products — AI Report

## Purpose
Add a third report under the admin-only "AI - Report" sidebar group, alongside
"Slow Products" and "Top Client Spend": a leaderboard of the fastest-moving
products by sales velocity, with a stock-runway warning so admins can catch
stockout risk on hot sellers before it happens.

## Ranking metric
**Sales velocity** = units sold in the selected period ÷ days elapsed since
the product's first sale within that window (not raw quantity or revenue).
This favors genuinely fast movers over products that simply accumulated
volume over a long window.

## Backend
New single-invoke controller `App\Http\Controllers\Api\V1\FastestProductsController`,
admin-only (`abort_unless(auth()->user()?->role === 'admin', 403)`), mirroring
`TopClientsController`.

Route: `GET /ai-reports/fastest-products?period=all|30d|90d|month|year`
(same `dateFilter` match-expression as `TopClientsController`).

Query (raw `DB::select`, matching the existing raw-SQL report pattern):

```sql
WITH sold AS (
    SELECT
        si.product_id,
        SUM(si.quantity)::integer               AS units_sold,
        SUM(si.quantity * si.unit_price)         AS revenue,
        MIN(s.sale_date)::date                   AS first_sale_in_period
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    WHERE s.is_reverted = false {dateFilter}
    GROUP BY si.product_id
),
stock_totals AS (
    SELECT product_id, SUM(current_stock)::integer AS total_stock
    FROM v_current_stock
    GROUP BY product_id
)
SELECT
    p.id                                                                      AS product_id,
    p.name                                                                    AS product_name,
    cat.name                                                                  AS category_name,
    so.units_sold,
    so.revenue,
    ROUND(so.units_sold::numeric / GREATEST(CURRENT_DATE - so.first_sale_in_period + 1, 1), 2) AS velocity,
    COALESCE(st.total_stock, 0)                                               AS current_stock,
    CASE
        WHEN so.units_sold = 0 OR (so.units_sold::numeric / GREATEST(CURRENT_DATE - so.first_sale_in_period + 1, 1)) = 0 THEN NULL
        ELSE FLOOR(COALESCE(st.total_stock, 0) / (so.units_sold::numeric / GREATEST(CURRENT_DATE - so.first_sale_in_period + 1, 1)))::integer
    END                                                                        AS days_of_stock_left
FROM products p
JOIN sold so ON so.product_id = p.id
LEFT JOIN categories cat ON cat.id = p.category_id
LEFT JOIN stock_totals st ON st.product_id = p.id
WHERE p.is_active = true
ORDER BY velocity DESC
LIMIT 50
```

Response shape: `{ data: FastestProduct[] }`.

## Frontend

`frontend/src/api/aiReports.ts`:
- Add `FastestProduct` interface (`product_id`, `product_name`, `category_name`,
  `units_sold`, `revenue`, `velocity`, `current_stock`, `days_of_stock_left`).
- Add `aiReportsApi.fastestProducts(period: TopClientsPeriod = 'all')` —
  reuses the existing `TopClientsPeriod` type (`all | month | year | 30d | 90d`).

`frontend/src/pages/ai-reports/FastestProductsPage.tsx`:
- Same shell as `TopClientsPage`: header + period `<select>`, loading state,
  empty state, table in a rounded card.
- Medal styling (🥇🥈🥉) for top 3 rows, same palette as `TopClientsPage`.
- Columns: Product, Category, Units Sold, Velocity (units/day), Revenue (TZS),
  Current Stock, Days of Stock Left.
- Days-of-stock-left badge: `current_stock = 0` → red "Out of stock";
  `days_of_stock_left < 7` → red; `< 14` → amber; otherwise plain gray text;
  `NULL` → "—".

## Sidebar & routing
- `Sidebar.tsx`: add `{ to: '/ai-reports/fastest-products', label: 'Fastest Products', icon: Zap }`
  to the existing "AI - Report" `NavGroup` children, after "Slow Products".
- `router.tsx`: add `{ path: 'ai-reports/fastest-products', element: <FastestProductsPage /> }`
  under the existing admin-only `RoleRoute` block, alongside the other two
  `ai-reports/*` routes.

## Out of scope
- No caching/materialized view — matches the existing reports' live-query approach.
- No CSV/export action (neither existing AI-Report page has one).
- No non-admin visibility.

## Deployment
After implementation: commit, push to `develop` (per [[project_github]]
convention), verify Railway deploy picks it up automatically. No new env vars
or migrations required — this feature only adds a controller, route, and two
frontend files plus two small edits to existing files.
