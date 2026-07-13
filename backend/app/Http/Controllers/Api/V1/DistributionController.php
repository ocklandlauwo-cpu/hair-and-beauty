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
        $distributions = Distribution::with('toLocation')->latest()->paginate(50);

        return response()->json($distributions->through(fn ($d) => array_merge(
            $d->only(self::FIELDS),
            ['to_location_name' => $d->toLocation?->name],
        )));
    }

    public function show(Distribution $distribution): JsonResponse
    {
        $this->authorize('viewAny', Distribution::class);
        $distribution->load('toLocation', 'items.product');

        return response()->json(['data' => array_merge(
            $distribution->only(self::FIELDS),
            ['to_location_name' => $distribution->toLocation?->name],
            ['items' => $distribution->items->map(fn ($i) => [
                'id'                => $i->id,
                'product_id'        => $i->product_id,
                'product_name'      => $i->product?->name ?? '—',
                'quantity_sent'     => $i->quantity_sent,
                'quantity_received' => $i->quantity_received,
            ])],
        )]);
    }

    public function store(StoreDistributionRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $fromLocationId = $validated['from_location_id']
            ?? Location::where('type', 'store')->firstOrFail()->id;

        if (isset($validated['from_location_id'])) {
            foreach ($validated['items'] as $item) {
                $currentStock = (int) (DB::table('v_current_stock')
                    ->where('product_id', $item['product_id'])
                    ->where('location_id', $fromLocationId)
                    ->value('current_stock') ?? 0);

                if ($item['quantity_sent'] > $currentStock) {
                    abort(422, "Insufficient stock for product #{$item['product_id']}: have {$currentStock}, requested {$item['quantity_sent']}.");
                }
            }
        }

        $distribution = DB::transaction(function () use ($validated, $user, $fromLocationId) {
            $distribution = Distribution::create([
                'from_location_id' => $fromLocationId,
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
                    'location_id' => $fromLocationId,
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
