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
use Illuminate\Http\Request;
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

    public function forecast(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Purchase::class);

        $request->validate([
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'months'      => ['required', 'integer', 'min:2', 'max:12'],
        ]);

        $locationId = $request->integer('location_id');
        $months     = $request->integer('months');

        $rows = DB::select("
            WITH avg_sales AS (
                SELECT si.product_id, SUM(si.quantity)::decimal / 90 AS avg_daily
                FROM sale_items si
                JOIN sales s ON s.id = si.sale_id
                WHERE s.location_id = ? AND s.sale_date >= CURRENT_DATE - 90 AND s.is_reverted = false
                GROUP BY si.product_id
            ),
            stock AS (
                SELECT product_id, current_stock FROM v_current_stock WHERE location_id = ?
            )
            SELECT
                p.id                                                                       AS product_id,
                p.name                                                                     AS product_name,
                cat.name                                                                   AS category_name,
                p.latest_cost                                                              AS latest_cost,
                ROUND(COALESCE(av.avg_daily, 0), 2)                                        AS avg_daily_sales,
                COALESCE(st.current_stock, 0)                                              AS current_stock,
                ROUND(COALESCE(av.avg_daily, 0) * 30 * ?)::integer                         AS projected_need,
                GREATEST(ROUND(COALESCE(av.avg_daily, 0) * 30 * ?)::integer - COALESCE(st.current_stock, 0), 0) AS suggested_purchase_qty
            FROM products p
            LEFT JOIN categories cat ON cat.id = p.category_id
            LEFT JOIN avg_sales av ON av.product_id = p.id
            LEFT JOIN stock st ON st.product_id = p.id
            WHERE p.is_active = true
            ORDER BY suggested_purchase_qty DESC
        ", [$locationId, $locationId, $months, $months]);

        return response()->json(['data' => $rows]);
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
