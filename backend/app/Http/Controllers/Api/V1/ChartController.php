<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChartController extends Controller
{
    public function salesByLocation(Request $request): JsonResponse
    {
        abort_unless($request->user()?->role === 'admin', 403);

        $from = $request->input('from', now()->startOfMonth()->toDateString());
        $to   = $request->input('to',   now()->toDateString());

        $rows = DB::select("
            SELECT s.sale_date::date AS date,
                   l.name AS location_name,
                   COALESCE(SUM(s.total_amount), 0)::numeric AS total
            FROM sales s
            JOIN locations l ON l.id = s.location_id
            WHERE s.sale_date::date BETWEEN ? AND ?
              AND s.is_reverted = false
            GROUP BY s.sale_date::date, l.name
            ORDER BY date, l.name
        ", [$from, $to]);

        $locations = collect($rows)->pluck('location_name')->unique()->sort()->values();

        return response()->json([
            'data' => [
                'rows'      => $rows,
                'locations' => $locations,
            ],
        ]);
    }

    public function profitByLocation(Request $request): JsonResponse
    {
        abort_unless($request->user()?->role === 'admin', 403);

        $from = $request->input('from', now()->startOfMonth()->toDateString());
        $to   = $request->input('to',   now()->toDateString());

        $rows = DB::select("
            WITH daily_sales AS (
                SELECT sale_date::date AS date, location_id,
                       COALESCE(SUM(total_amount), 0) AS sales
                FROM sales
                WHERE sale_date::date BETWEEN ? AND ? AND is_reverted = false
                GROUP BY date, location_id
            ),
            daily_expenses AS (
                SELECT expense_date::date AS date, location_id,
                       COALESCE(SUM(amount), 0) AS expenses
                FROM expenses
                WHERE expense_date::date BETWEEN ? AND ? AND business_line = 'shop'
                GROUP BY date, location_id
            ),
            all_dates AS (
                SELECT DISTINCT date FROM daily_sales
                UNION SELECT DISTINCT date FROM daily_expenses
            )
            SELECT d.date::text,
                   l.name AS location_name,
                   (COALESCE(ds.sales, 0) - COALESCE(de.expenses, 0))::numeric AS total
            FROM all_dates d
            CROSS JOIN (SELECT id, name FROM locations WHERE is_active = true) l
            LEFT JOIN daily_sales    ds ON ds.date = d.date AND ds.location_id = l.id
            LEFT JOIN daily_expenses de ON de.date = d.date AND de.location_id = l.id
            ORDER BY d.date, l.name
        ", [$from, $to, $from, $to]);

        $locations = collect($rows)->pluck('location_name')->unique()->sort()->values();

        return response()->json([
            'data' => [
                'rows'      => $rows,
                'locations' => $locations,
            ],
        ]);
    }

    public function purchasesByMonth(Request $request): JsonResponse
    {
        abort_unless($request->user()?->role === 'admin', 403);

        $from = $request->input('from', now()->subYear()->startOfMonth()->toDateString());
        $to   = $request->input('to',   now()->toDateString());

        $rows = DB::select("
            SELECT TO_CHAR(purchase_date, 'YYYY-MM')  AS month,
                   TO_CHAR(purchase_date, 'Mon YYYY') AS month_label,
                   COALESCE(SUM(total_amount), 0)::numeric AS total,
                   COUNT(*)::int AS count
            FROM purchases
            WHERE purchase_date::date BETWEEN ? AND ?
            GROUP BY TO_CHAR(purchase_date, 'YYYY-MM'), TO_CHAR(purchase_date, 'Mon YYYY')
            ORDER BY month
        ", [$from, $to]);

        return response()->json(['data' => $rows]);
    }
}
