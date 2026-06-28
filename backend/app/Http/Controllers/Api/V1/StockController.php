<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class StockController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = DB::table('v_current_stock')->get();

        return response()->json(['data' => $rows]);
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
}
