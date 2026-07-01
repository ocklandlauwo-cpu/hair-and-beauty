<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StorePurchaseRequest;
use App\Models\Batch;
use App\Models\Location;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class PurchaseController extends Controller
{
    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Purchase::class);
        $purchases = Purchase::with('items')->latest()->paginate(50);

        return response()->json($purchases->through(fn ($p) => array_merge(
            $p->only(['id', 'purchased_by', 'supplier_name', 'invoice_number', 'purchase_date', 'notes']),
            ['total_amount' => $p->items->sum(fn ($i) => $i->quantity * (float) $i->unit_cost)],
        )));
    }

    public function show(Purchase $purchase): JsonResponse
    {
        $this->authorize('view', $purchase);
        $purchase->load('items.product');

        return response()->json(['data' => array_merge(
            $purchase->only(['id', 'purchased_by', 'supplier_name', 'invoice_number', 'purchase_date', 'notes']),
            ['total_amount' => $purchase->items->sum(fn ($i) => $i->quantity * (float) $i->unit_cost)],
            ['items' => $purchase->items->map(fn ($i) => [
                'id'           => $i->id,
                'product_id'   => $i->product_id,
                'product_name' => $i->product?->name ?? '—',
                'quantity'     => $i->quantity,
                'unit_cost'    => $i->unit_cost,
                'line_total'   => $i->quantity * (float) $i->unit_cost,
            ])],
        )]);
    }

    public function store(StorePurchaseRequest $request): JsonResponse
    {
        $user = $request->user();
        $store = Location::where('type', 'store')->firstOrFail();
        $validated = $request->validated();

        $purchase = DB::transaction(function () use ($validated, $user, $store) {
            $purchase = Purchase::create([
                'purchased_by' => $user->id,
                'supplier_name' => $validated['supplier_name'] ?? null,
                'invoice_number' => $validated['invoice_number'] ?? null,
                'purchase_date' => $validated['purchase_date'],
                'notes' => $validated['notes'] ?? null,
            ]);

            foreach ($validated['items'] as $item) {
                $batchId = $item['batch_id'] ?? null;

                if ($batchId === null && (! empty($item['expiry_date']) || ! empty($item['batch_number']))) {
                    $batch = Batch::create([
                        'product_id' => $item['product_id'],
                        'batch_number' => $item['batch_number'] ?? null,
                        'expiry_date' => $item['expiry_date'] ?? null,
                    ]);
                    $batchId = $batch->id;
                }

                PurchaseItem::create([
                    'purchase_id' => $purchase->id,
                    'product_id' => $item['product_id'],
                    'batch_id' => $batchId,
                    'quantity' => $item['quantity'],
                    'unit_cost' => $item['unit_cost'],
                ]);
                // ↑ triggers fn_update_product_latest_cost() automatically

                StockMovement::create([
                    'product_id' => $item['product_id'],
                    'location_id' => $store->id,
                    'movement_type' => 'purchase',
                    'quantity' => $item['quantity'],
                    'reference_type' => 'purchase',
                    'reference_id' => $purchase->id,
                    'batch_id' => $batchId,
                    'unit_cost' => $item['unit_cost'],
                    'performed_by' => $user->id,
                ]);
            }

            return $purchase;
        });

        return response()->json([
            'data' => $purchase->only(['id', 'purchased_by', 'supplier_name', 'invoice_number', 'purchase_date', 'notes']),
        ], 201);
    }
}
