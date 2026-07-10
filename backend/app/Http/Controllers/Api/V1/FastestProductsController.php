<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FastestProductsController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        abort_unless(auth()->user()?->role === 'admin', 403);

        $period = $request->input('period', 'all');

        $dateFilter = match ($period) {
            'month' => "AND s.sale_date >= date_trunc('month', CURRENT_DATE)",
            'year'  => "AND s.sale_date >= date_trunc('year', CURRENT_DATE)",
            '30d'   => "AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'",
            '90d'   => "AND s.sale_date >= CURRENT_DATE - INTERVAL '90 days'",
            default => '',
        };

        $rows = DB::select("
            WITH sold AS (
                SELECT
                    si.product_id,
                    SUM(si.quantity)::integer               AS units_sold,
                    SUM(si.quantity * si.unit_price)         AS revenue,
                    MIN(s.sale_date)::date                   AS first_sale_in_period
                FROM sales s
                JOIN sale_items si ON si.sale_id = s.id
                WHERE s.is_reverted = false
                      {$dateFilter}
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
                ROUND(so.units_sold / GREATEST(CURRENT_DATE - so.first_sale_in_period + 1, 1), 2) AS velocity,
                COALESCE(st.total_stock, 0)                                               AS current_stock,
                CASE
                    WHEN so.units_sold = 0 OR (so.units_sold::numeric / GREATEST(CURRENT_DATE - so.first_sale_in_period + 1, 1)) = 0 THEN NULL
                    ELSE FLOOR(COALESCE(st.total_stock, 0) / (so.units_sold::numeric / GREATEST(CURRENT_DATE - so.first_sale_in_period + 1, 1)))
                END                                                                        AS days_of_stock_left
            FROM products p
            JOIN sold so ON so.product_id = p.id
            LEFT JOIN categories cat ON cat.id = p.category_id
            LEFT JOIN stock_totals st ON st.product_id = p.id
            WHERE p.is_active = true
            ORDER BY velocity DESC
            LIMIT 50
        ");

        return response()->json(['data' => $rows]);
    }
}
