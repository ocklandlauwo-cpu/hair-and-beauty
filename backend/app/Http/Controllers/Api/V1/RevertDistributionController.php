<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Distribution;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RevertDistributionController extends Controller
{
    public function __invoke(Request $request, Distribution $distribution): JsonResponse
    {
        $this->authorize('revert', $distribution);

        DB::transaction(function () use ($distribution, $request) {
            foreach ($distribution->items as $item) {
                if ($item->quantity_received !== null && $item->quantity_received > 0) {
                    StockMovement::create([
                        'product_id'     => $item->product_id,
                        'location_id'    => $distribution->to_location_id,
                        'movement_type'  => 'distribution_revert',
                        'quantity'       => -$item->quantity_received,
                        'reference_type' => 'distribution',
                        'reference_id'   => $distribution->id,
                        'batch_id'       => $item->batch_id ?? null,
                        'unit_cost'      => 0,
                        'performed_by'   => $request->user()->id,
                    ]);
                }

                $item->update(['quantity_received' => null]);
            }

            $distribution->update([
                'status'       => 'pending',
                'confirmed_by' => null,
                'confirmed_at' => null,
            ]);
        });

        return response()->json(['data' => $distribution->fresh()->only([
            'id', 'status', 'confirmed_by', 'confirmed_at',
        ])]);
    }
}
