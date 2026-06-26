<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreDistributionRequest;
use App\Models\Distribution;
use App\Models\DistributionItem;
use App\Models\Location;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class DistributionController extends Controller
{
    private const FIELDS = ['id', 'from_location_id', 'to_location_id', 'distributed_by',
        'confirmed_by', 'status', 'distributed_at', 'confirmed_at', 'notes'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Distribution::class);
        $distributions = Distribution::latest()->paginate(50);

        return response()->json($distributions->through(fn ($d) => $d->only(self::FIELDS)));
    }

    public function show(Distribution $distribution): JsonResponse
    {
        $this->authorize('viewAny', Distribution::class);

        return response()->json(['data' => array_merge(
            $distribution->only(self::FIELDS),
            ['items' => $distribution->items->map->only(['id', 'product_id', 'batch_id', 'quantity_sent', 'quantity_received'])],
        )]);
    }

    public function store(StoreDistributionRequest $request): JsonResponse
    {
        $user = $request->user();
        $store = Location::where('type', 'store')->firstOrFail();
        $validated = $request->validated();

        $distribution = DB::transaction(function () use ($validated, $user, $store) {
            $distribution = Distribution::create([
                'from_location_id' => $store->id,
                'to_location_id' => $validated['to_location_id'],
                'distributed_by' => $user->id,
                'status' => 'pending',
                'distributed_at' => $validated['distributed_at'],
                'notes' => $validated['notes'] ?? null,
            ]);

            foreach ($validated['items'] as $item) {
                DistributionItem::create([
                    'distribution_id' => $distribution->id,
                    'product_id' => $item['product_id'],
                    'batch_id' => $item['batch_id'] ?? null,
                    'quantity_sent' => $item['quantity_sent'],
                ]);

                StockMovement::create([
                    'product_id' => $item['product_id'],
                    'location_id' => $store->id,
                    'movement_type' => 'distribution_out',
                    'quantity' => -$item['quantity_sent'],
                    'reference_type' => 'distribution',
                    'reference_id' => $distribution->id,
                    'batch_id' => $item['batch_id'] ?? null,
                    'unit_cost' => 0,
                    'performed_by' => $user->id,
                ]);
            }

            return $distribution;
        });

        return response()->json(['data' => $distribution->only(self::FIELDS)], 201);
    }
}
