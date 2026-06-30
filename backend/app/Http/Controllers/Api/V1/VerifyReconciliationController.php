<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Reconciliation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VerifyReconciliationController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'seller_id', 'reconciliation_date',
        'total_sold_amount', 'receipt_path', 'notes', 'verified_by', 'verified_at'];

    public function __invoke(Request $request, Reconciliation $reconciliation): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            abort(403, 'Only admins can verify reconciliations.');
        }

        if ($reconciliation->verified_by !== null) {
            return response()->json(['message' => 'Reconciliation is already verified.'], 422);
        }

        $reconciliation->update([
            'verified_by' => $request->user()->id,
            'verified_at' => now(),
        ]);

        return response()->json(['data' => $reconciliation->fresh()->only(self::FIELDS)]);
    }
}
