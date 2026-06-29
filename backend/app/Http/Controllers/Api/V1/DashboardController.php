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
        $salesToday = DB::table('sales')->whereDate('sale_date', today())->where('is_reverted', false)->sum('total_amount');
        $salesMonth = DB::table('sales')->whereYear('sale_date', now()->year)->whereMonth('sale_date', now()->month)->where('is_reverted', false)->sum('total_amount');
        $expensesMonth = DB::table('expenses')->whereYear('expense_date', now()->year)->whereMonth('expense_date', now()->month)->sum('amount');
        $pendingDist = DB::table('distributions')->where('status', 'pending')->count();
        $expiryAlerts = DB::table('v_expiry_alerts')->count();
        $lowStockAlerts = DB::table('v_low_stock_alerts')->count();
        $activeUsers = DB::table('users')->where('is_active', true)->count();

        return [
            'role' => 'admin',
            'sales' => [
                'today' => number_format((float) $salesToday, 2, '.', ''),
                'this_month' => number_format((float) $salesMonth, 2, '.', ''),
            ],
            'expenses' => [
                'this_month' => number_format((float) $expensesMonth, 2, '.', ''),
            ],
            'distributions' => ['pending' => (int) $pendingDist],
            'stock' => [
                'expiry_alerts' => (int) $expiryAlerts,
                'low_stock_alerts' => (int) $lowStockAlerts,
            ],
            'users' => ['active' => (int) $activeUsers],
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
