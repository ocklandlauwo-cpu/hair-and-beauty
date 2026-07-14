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

        // ── Profit: sum((unit_price - unit_cost) × quantity) ────────────
        $profitToday = (float) DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereDate('sales.sale_date', today())
            ->where('sales.is_reverted', false)
            ->selectRaw('COALESCE(SUM((sale_items.unit_price - sale_items.unit_cost) * sale_items.quantity), 0) as total')
            ->value('total');

        $profitMonth = (float) DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereYear('sales.sale_date', $year)
            ->whereMonth('sales.sale_date', $month)
            ->where('sales.is_reverted', false)
            ->selectRaw('COALESCE(SUM((sale_items.unit_price - sale_items.unit_cost) * sale_items.quantity), 0) as total')
            ->value('total');

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

        $profitTodayByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM((si.unit_price - si.unit_cost) * si.quantity), 0)::numeric AS total
            FROM locations l
            LEFT JOIN sales s ON s.location_id = l.id
                AND s.sale_date::date = CURRENT_DATE AND s.is_reverted = false
            LEFT JOIN sale_items si ON si.sale_id = s.id
            WHERE l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ");

        $profitMonthByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM((si.unit_price - si.unit_cost) * si.quantity), 0)::numeric AS total
            FROM locations l
            LEFT JOIN sales s ON s.location_id = l.id
                AND EXTRACT(YEAR FROM s.sale_date) = ? AND EXTRACT(MONTH FROM s.sale_date) = ?
                AND s.is_reverted = false
            LEFT JOIN sale_items si ON si.sale_id = s.id
            WHERE l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ", [$year, $month]);

        $assetValue = (float) DB::table('v_current_stock as cs')
            ->join('locations as l', 'l.id', '=', 'cs.location_id')
            ->where('l.type', 'shop')
            ->where('l.is_active', true)
            ->selectRaw('COALESCE(SUM(GREATEST(cs.current_stock, 0) * cs.latest_cost), 0) as total')
            ->value('total');

        $assetValueByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM(GREATEST(cs.current_stock, 0) * cs.latest_cost), 0)::numeric AS total
            FROM locations l
            LEFT JOIN v_current_stock cs ON cs.location_id = l.id
            WHERE l.type = 'shop' AND l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ");

        $storeAssetValue = (float) DB::table('v_current_stock as cs')
            ->join('locations as l', 'l.id', '=', 'cs.location_id')
            ->where('l.type', 'store')
            ->where('l.is_active', true)
            ->selectRaw('COALESCE(SUM(GREATEST(cs.current_stock, 0) * cs.latest_cost), 0) as total')
            ->value('total');

        $storeAssetValueByLocation = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM(GREATEST(cs.current_stock, 0) * cs.latest_cost), 0)::numeric AS total
            FROM locations l
            LEFT JOIN v_current_stock cs ON cs.location_id = l.id
            WHERE l.type = 'store' AND l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ");

        $fmt = fn (float $v) => number_format($v, 2, '.', '');

        $fmtShop = fn ($row) => [
            'location_id'   => $row->location_id,
            'location_name' => $row->location_name,
            'total'         => $fmt((float) $row->total),
        ];

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
                'today'              => $fmt($profitToday),
                'today_by_shop'      => collect($profitTodayByShop)->map($fmtShop)->values(),
                'this_month'         => $fmt($profitMonth),
                'this_month_by_shop' => collect($profitMonthByShop)->map($fmtShop)->values(),
            ],
            'asset_value' => [
                'total'   => $fmt($assetValue),
                'by_shop' => collect($assetValueByShop)->map($fmtShop)->values(),
            ],
            'store_asset_value' => [
                'total'       => $fmt($storeAssetValue),
                'by_location' => collect($storeAssetValueByLocation)->map($fmtShop)->values(),
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
