<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ConfirmDistributionRequest;
use App\Models\Distribution;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class ConfirmDistributionController extends Controller
{
    public function __invoke(ConfirmDistributionRequest $request, Distribution $distribution): JsonResponse
    {
        $this->authorize('confirm', $distribution);

        $user = $request->user();
        $itemsData = collect($request->validated()['items'])->keyBy('distribution_item_id');

        DB::transaction(function () use ($distribution, $itemsData, $user) {
            foreach ($distribution->items as $distItem) {
                $received = $itemsData->get($distItem->id)['quantity_received'] ?? $distItem->quantity_sent;

                $distItem->update(['quantity_received' => $received]);

                StockMovement::create([
                    'product_id' => $distItem->product_id,
                    'location_id' => $distribution->to_location_id,
                    'movement_type' => 'distribution_in',
                    'quantity' => $received,
                    'reference_type' => 'distribution',
                    'reference_id' => $distribution->id,
                    'batch_id' => $distItem->batch_id,
                    'unit_cost' => 0,
                    'performed_by' => $user->id,
                ]);
            }

            $freshItems = $distribution->items()->get();
            $hasDiscrepancy = $freshItems->some(fn ($i) => $i->quantity_received !== $i->quantity_sent);

            $distribution->update([
                'status' => $hasDiscrepancy ? 'discrepancy' : 'confirmed',
                'confirmed_by' => $user->id,
                'confirmed_at' => now(),
            ]);
        });

        return response()->json(['data' => $distribution->fresh()->only([
            'id', 'status', 'confirmed_by', 'confirmed_at',
        ])]);
    }
}
