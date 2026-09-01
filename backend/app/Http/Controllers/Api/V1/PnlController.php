<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PnlController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
        ]);

        $user = $request->user();
        $from = $request->input('from', now()->startOfMonth()->toDateString());
        $to = $request->input('to', now()->toDateString());
        $locationId = (int) $request->input('location_id');

        // Sellers are always scoped to their own location
        if ($user->role === 'seller') {
            $locationId = $user->location_id;
        }

        // Revenue & COGS from non-reverted sale_items
        $salesQuery = DB::table('sale_items as si')
            ->join('sales as s', 's.id', '=', 'si.sale_id')
            ->whereBetween('s.sale_date', [$from, $to])
            ->where('s.is_reverted', false);

        if ($locationId) {
            $salesQuery->where('s.location_id', $locationId);
        }

        $revenue = (string) number_format(
            (float) $salesQuery->sum(DB::raw('si.unit_price * si.quantity')), 2, '.', ''
        );
        $cogs = (string) number_format(
            (float) $salesQuery->sum(DB::raw('si.unit_cost * si.quantity')), 2, '.', ''
        );

        // Operating expenses
        $expenseQuery = DB::table('expenses')
            ->where('business_line', 'shop')
            ->whereBetween('expense_date', [$from, $to]);

        if ($locationId) {
            $expenseQuery->where('location_id', $locationId);
        }

        $totalExpenses = (string) number_format(
            (float) $expenseQuery->sum('amount'), 2, '.', ''
        );

        $expenseBreakdown = DB::table('expenses')
            ->where('business_line', 'shop')
            ->whereBetween('expense_date', [$from, $to])
            ->when($locationId, fn ($q) => $q->where('location_id', $locationId))
            ->select('category', DB::raw('SUM(amount) as total'))
            ->groupBy('category')
            ->orderBy('category')
            ->get()
            ->map(fn ($row) => [
                'category' => $row->category,
                'total' => number_format((float) $row->total, 2, '.', ''),
            ]);

        $grossProfit = bcsub($revenue, $cogs, 2);
        $netProfit = bcsub($grossProfit, $totalExpenses, 2);

        return response()->json([
            'data' => [
                'location_id' => $locationId ?: null,
                'period' => ['from' => $from, 'to' => $to],
                'revenue' => $revenue,
                'cost_of_goods_sold' => $cogs,
                'gross_profit' => $grossProfit,
                'expenses' => $totalExpenses,
                'net_profit' => $netProfit,
                'expense_breakdown' => $expenseBreakdown,
            ],
        ]);
    }
}
