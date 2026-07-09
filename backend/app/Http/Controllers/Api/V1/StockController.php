<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = DB::table('v_current_stock')->get();

        return response()->json(['data' => $rows]);
    }

    public function movements(Request $request): JsonResponse
    {
        $request->validate([
            'product_id'  => ['required', 'integer', 'exists:products,id'],
            'location_id' => ['required', 'integer', 'exists:locations,id'],
        ]);

        $movements = StockMovement::where('product_id', $request->integer('product_id'))
            ->where('location_id', $request->integer('location_id'))
            ->orderByDesc('created_at')
            ->limit(200)
            ->get(['id', 'movement_type', 'quantity', 'created_at']);

        return response()->json(['data' => $movements]);
    }

    public function expiry(): JsonResponse
    {
        $rows = DB::table('v_expiry_alerts')->orderBy('days_until_expiry')->get();

        return response()->json(['data' => $rows]);
    }

    public function low(): JsonResponse
    {
        $rows = DB::table('v_low_stock_alerts')->orderBy('days_of_cover')->get();

        return response()->json(['data' => $rows]);
    }

    public function slow(): JsonResponse
    {
        abort_unless(auth()->user()?->role === 'admin', 403);

        $rows = DB::select("
            WITH last_sale AS (
                SELECT si.product_id, MAX(s.sale_date)::date AS last_sold
                FROM sales s
                JOIN sale_items si ON si.sale_id = s.id
                WHERE s.is_reverted = false
                GROUP BY si.product_id
            ),
            stock_totals AS (
                SELECT product_id, SUM(current_stock)::integer AS total_stock
                FROM v_current_stock
                WHERE current_stock > 0
                GROUP BY product_id
            )
            SELECT
                p.id                                                   AS product_id,
                p.name                                                 AS product_name,
                cat.name                                               AS category_name,
                p.retail_price,
                COALESCE(st.total_stock, 0)                            AS total_stock,
                CASE WHEN ls.last_sold IS NULL THEN NULL
                     ELSE (CURRENT_DATE - ls.last_sold)::integer END   AS days_since_last_sale
            FROM products p
            LEFT JOIN categories cat ON cat.id = p.category_id
            LEFT JOIN last_sale ls ON ls.product_id = p.id
            LEFT JOIN stock_totals st ON st.product_id = p.id
            WHERE p.is_active = true
              AND COALESCE(st.total_stock, 0) > 0
              AND (ls.last_sold IS NULL OR ls.last_sold <= CURRENT_DATE - INTERVAL '60 days')
            ORDER BY days_since_last_sale DESC NULLS FIRST
        ");

        return response()->json(['data' => $rows]);
    }

    public function adjust(Request $request): JsonResponse
    {
        abort_unless($request->user()?->role === 'admin', 403);

        $data = $request->validate([
            'product_id'   => ['required', 'integer', 'exists:products,id'],
            'location_id'  => ['required', 'integer', 'exists:locations,id'],
            'new_quantity' => ['required', 'integer', 'min:0'],
            'notes'        => ['nullable', 'string', 'max:255'],
        ]);

        $current = (int) DB::table('v_current_stock')
            ->where('product_id', $data['product_id'])
            ->where('location_id', $data['location_id'])
            ->value('current_stock') ?? 0;

        $delta = $data['new_quantity'] - $current;

        if ($delta === 0) {
            return response()->json(['message' => 'No change — quantity is already ' . $current]);
        }

        StockMovement::create([
            'product_id'    => $data['product_id'],
            'location_id'   => $data['location_id'],
            'movement_type' => 'adjustment',
            'quantity'      => $delta,
            'reference_type' => 'adjustment',
            'reference_id'   => $request->user()->id,
            'performed_by'  => $request->user()->id,
            'notes'         => $data['notes'] ?? null,
        ]);

        return response()->json(['message' => 'Stock adjusted', 'new_quantity' => $data['new_quantity']]);
    }
}
