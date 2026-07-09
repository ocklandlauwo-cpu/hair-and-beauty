<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TopClientsController extends Controller
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
            SELECT
                c.id                                              AS client_id,
                c.name                                            AS client_name,
                c.phone,
                l.name                                            AS location_name,
                COUNT(s.id)::integer                              AS total_purchases,
                SUM(s.total_amount - s.discount_amount)           AS total_spend,
                ROUND(AVG(s.total_amount - s.discount_amount), 0) AS avg_order_value,
                MAX(s.sale_date)::date                            AS last_purchase_date
            FROM clients c
            LEFT JOIN locations l ON l.id = c.location_id
            JOIN sales s ON s.client_id = c.id
                        AND s.is_reverted = false
                        {$dateFilter}
            GROUP BY c.id, c.name, c.phone, l.name
            ORDER BY total_spend DESC
            LIMIT 50
        ");

        return response()->json(['data' => $rows]);
    }
}
