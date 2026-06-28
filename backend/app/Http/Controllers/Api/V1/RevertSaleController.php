<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RevertSaleRequest;
use App\Models\Sale;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class RevertSaleController extends Controller
{
    public function __invoke(RevertSaleRequest $request, Sale $sale): JsonResponse
    {
        $this->authorize('revert', $sale);

        $user = $request->user();

        DB::transaction(function () use ($sale, $user, $request) {
            $sale->update([
                'is_reverted' => true,
                'reverted_by' => $user->id,
                'reverted_at' => now(),
                'revert_reason' => $request->validated()['reason'],
            ]);

            foreach ($sale->items as $saleItem) {
                StockMovement::create([
                    'product_id' => $saleItem->product_id,
                    'location_id' => $sale->location_id,
                    'movement_type' => 'sale_revert',
                    'quantity' => $saleItem->quantity,
                    'reference_type' => 'sale',
                    'reference_id' => $sale->id,
                    'batch_id' => $saleItem->batch_id,
                    'unit_cost' => $saleItem->unit_cost,
                    'performed_by' => $user->id,
                ]);
            }
        });

        return response()->json(['data' => $sale->fresh()->only([
            'id', 'is_reverted', 'reverted_by', 'reverted_at', 'revert_reason',
        ])]);
    }
}
