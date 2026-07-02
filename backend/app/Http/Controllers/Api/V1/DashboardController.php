<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role === 'admin') {
            $data = $this->adminData();
        } elseif ($user->role === 'store_keeper') {
            $data = $this->storeKeeperData();
        } else {
            $data = $this->sellerData($user);
        }

        return response()->json(['data' => $data]);
    }

    private function adminData(): array
    {
        $year  = now()->year;
        $month = now()->month;

        // ── Totals ──────────────────────────────────────────────────────
        $salesToday     = (float) DB::table('sales')->whereDate('sale_date', today())->where('is_reverted', false)->sum('total_amount');
        $salesMonth     = (float) DB::table('sales')->whereYear('sale_date', $year)->whereMonth('sale_date', $month)->where('is_reverted', false)->sum('total_amount');
        $expensesToday  = (float) DB::table('expenses')->whereDate('expense_date', today())->sum('amount');
        $expensesMonth  = (float) DB::table('expenses')->whereYear('expense_date', $year)->whereMonth('expense_date', $month)->sum('amount');
        $pendingDist    = DB::table('distributions')->where('status', 'pending')->count();
        $expiryAlerts   = DB::table('v_expiry_alerts')->count();
        $lowStockAlerts = DB::table('v_low_stock_alerts')->count();

        // ── Per-shop breakdowns ─────────────────────────────────────────
        $salesTodayByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM(s.total_amount), 0)::numeric AS total
            FROM locations l
            LEFT JOIN sales s ON s.location_id = l.id
                AND s.sale_date::date = CURRENT_DATE AND s.is_reverted = false
            WHERE l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ");

        $salesMonthByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM(s.total_amount), 0)::numeric AS total
            FROM locations l
            LEFT JOIN sales s ON s.location_id = l.id
                AND EXTRACT(YEAR FROM s.sale_date) = ? AND EXTRACT(MONTH FROM s.sale_date) = ?
                AND s.is_reverted = false
            WHERE l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ", [$year, $month]);

        $expensesMonthByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM(e.amount), 0)::numeric AS total
            FROM locations l
            LEFT JOIN expenses e ON e.location_id = l.id
                AND EXTRACT(YEAR FROM e.expense_date) = ? AND EXTRACT(MONTH FROM e.expense_date) = ?
            WHERE l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ", [$year, $month]);

        // Expense maps for profit calculation
        $expTodayMap  = collect(DB::select("
            SELECT l.id AS location_id, COALESCE(SUM(e.amount), 0)::numeric AS total
            FROM locations l
            LEFT JOIN expenses e ON e.location_id = l.id AND e.expense_date::date = CURRENT_DATE
            WHERE l.is_active = true GROUP BY l.id
        "))->keyBy('location_id');

        $expMonthMap = collect($expensesMonthByShop)->keyBy('location_id');

        $fmt = fn (float $v) => number_format($v, 2, '.', '');

        $fmtShop = fn ($row) => [
            'location_id'   => $row->location_id,
            'location_name' => $row->location_name,
            'total'         => $fmt((float) $row->total),
        ];

        $profitTodayByShop = collect($salesTodayByShop)->map(function ($row) use ($expTodayMap, $fmt) {
            $exp    = (float) ($expTodayMap->get($row->location_id)?->total ?? 0);
            return [
                'location_id'   => $row->location_id,
                'location_name' => $row->location_name,
                'total'         => $fmt((float) $row->total - $exp),
            ];
        })->values();

        $profitMonthByShop = collect($salesMonthByShop)->map(function ($row) use ($expMonthMap, $fmt) {
            $exp    = (float) ($expMonthMap->get($row->location_id)?->total ?? 0);
            return [
                'location_id'   => $row->location_id,
                'location_name' => $row->location_name,
                'total'         => $fmt((float) $row->total - $exp),
            ];
        })->values();

        return [
            'role' => 'admin',
            'sales' => [
                'today'              => $fmt($salesToday),
                'today_by_shop'      => collect($salesTodayByShop)->map($fmtShop)->values(),
                'this_month'         => $fmt($salesMonth),
                'this_month_by_shop' => collect($salesMonthByShop)->map($fmtShop)->values(),
            ],
            'expenses' => [
                'this_month'         => $fmt($expensesMonth),
                'this_month_by_shop' => collect($expensesMonthByShop)->map($fmtShop)->values(),
            ],
            'profit' => [
                'today'              => $fmt($salesToday - $expensesToday),
                'today_by_shop'      => $profitTodayByShop,
                'this_month'         => $fmt($salesMonth - $expensesMonth),
                'this_month_by_shop' => $profitMonthByShop,
            ],
            'distributions' => ['pending' => (int) $pendingDist],
            'stock' => [
                'expiry_alerts'    => (int) $expiryAlerts,
                'low_stock_alerts' => (int) $lowStockAlerts,
            ],
            'users' => ['active' => (int) DB::table('users')->where('is_active', true)->count()],
        ];
    }

    private function storeKeeperData(): array
    {
        $pendingDist = DB::table('distributions')->where('status', 'pending')->count();
        $thisWeekDist = DB::table('distributions')->whereBetween('distributed_at', [now()->startOfWeek(), now()->endOfWeek()])->count();
        $purchasesMonth = DB::table('purchases')->whereYear('purchase_date', now()->year)->whereMonth('purchase_date', now()->month)->count();
        $expiryAlerts = DB::table('v_expiry_alerts')->count();
        $lowStockAlerts = DB::table('v_low_stock_alerts')->count();

        return [
            'role' => 'store_keeper',
            'distributions' => [
                'pending' => (int) $pendingDist,
                'this_week' => (int) $thisWeekDist,
            ],
            'purchases' => ['this_month_count' => (int) $purchasesMonth],
            'stock' => [
                'expiry_alerts' => (int) $expiryAlerts,
                'low_stock_alerts' => (int) $lowStockAlerts,
            ],
        ];
    }

    private function sellerData(User $user): array
    {
        $locationId = $user->location_id;

        $salesToday = DB::table('sales')->where('location_id', $locationId)->whereDate('sale_date', today())->where('is_reverted', false)->sum('total_amount');
        $salesCountToday = DB::table('sales')->where('location_id', $locationId)->whereDate('sale_date', today())->where('is_reverted', false)->count();

        $reconciliationPending = ! DB::table('reconciliations')
            ->where('location_id', $locationId)
            ->where('seller_id', $user->id)
            ->whereDate('reconciliation_date', today())
            ->exists();

        $lowStockCount = DB::table('v_low_stock_alerts')
            ->where('location_id', $locationId)
            ->count();

        $lastAttendance = DB::table('attendance')
            ->where('user_id', $user->id)
            ->whereDate('recorded_at', today())
            ->orderByDesc('recorded_at')
            ->value('action');

        return [
            'role' => 'seller',
            'sales_today' => number_format((float) $salesToday, 2, '.', ''),
            'sales_count_today' => (int) $salesCountToday,
            'reconciliation_pending' => $reconciliationPending,
            'low_stock_count' => (int) $lowStockCount,
            'attendance_today' => $lastAttendance,
        ];
    }
}
