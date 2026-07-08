<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Distribution;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CancelDistributionController extends Controller
{
    public function __invoke(Request $request, Distribution $distribution): JsonResponse
    {
        $this->authorize('cancel', $distribution);

        DB::transaction(function () use ($distribution, $request) {
            // Restore store stock by reversing each distribution_out movement
            foreach ($distribution->items as $item) {
                StockMovement::create([
                    'product_id'     => $item->product_id,
                    'location_id'    => $distribution->from_location_id,
                    'movement_type'  => 'distribution_cancel',
                    'quantity'       => $item->quantity_sent,  // positive = back into store
                    'reference_type' => 'distribution',
                    'reference_id'   => $distribution->id,
                    'batch_id'       => $item->batch_id ?? null,
                    'unit_cost'      => 0,
                    'performed_by'   => $request->user()->id,
                ]);
            }

            $distribution->update(['status' => 'cancelled']);
        });

        return response()->json(['data' => $distribution->fresh()->only(['id', 'status'])]);
    }
}
