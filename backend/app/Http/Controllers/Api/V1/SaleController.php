<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreSaleRequest;
use App\Models\Product;
use App\Models\Sale;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'sold_by', 'client_id', 'payment_method',
        'total_amount', 'discount_amount', 'is_reverted', 'sale_date'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Sale::class);
        $sales = Sale::latest()->paginate(50);

        return response()->json($sales->through(fn ($s) => $s->only(self::FIELDS)));
    }

    public function show(Sale $sale): JsonResponse
    {
        $this->authorize('viewAny', Sale::class);

        return response()->json(['data' => array_merge(
            $sale->only(self::FIELDS),
            ['items' => $sale->items->map->only(['id', 'product_id', 'batch_id', 'quantity', 'unit_price', 'unit_cost', 'price_tier'])],
        )]);
    }

    public function store(StoreSaleRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $sale = DB::transaction(function () use ($validated, $user) {
            // Admin can target any location; sellers are bound to their own location.
            $locationId = ($user->role === 'admin' && ! empty($validated['location_id']))
                ? $validated['location_id']
                : $user->location_id;

            $totalAmount = '0';
            $itemsToInsert = [];

            foreach ($validated['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);
                $priceTier = $product->priceTierFor($item['quantity']);
                $unitPrice = isset($item['unit_price']) && $item['unit_price'] !== null
                    ? $item['unit_price']
                    : $product->priceFor($item['quantity']);
                $lineTotal = bcmul((string) $unitPrice, (string) $item['quantity'], 2);
                $totalAmount = bcadd($totalAmount, $lineTotal, 2);

                $itemsToInsert[] = [
                    'product_id' => $item['product_id'],
                    'batch_id' => $item['batch_id'] ?? null,
                    'quantity' => $item['quantity'],
                    'unit_price' => $unitPrice,
                    'unit_cost' => $product->latest_cost,
                    'price_tier' => $priceTier,
                ];
            }

            $discount = $validated['discount_amount'] ?? 0;

            $sale = Sale::create([
                'location_id' => $locationId,
                'sold_by' => $user->id,
                'client_id' => $validated['client_id'] ?? null,
                'payment_method' => $validated['payment_method'],
                'total_amount' => bcsub($totalAmount, (string) $discount, 2),
                'discount_amount' => $discount,
                'sale_date' => $validated['sale_date'],
            ]);

            foreach ($itemsToInsert as $itemData) {
                $sale->items()->create($itemData);

                StockMovement::create([
                    'product_id' => $itemData['product_id'],
                    'location_id' => $locationId,
                    'movement_type' => 'sale',
                    'quantity' => -$itemData['quantity'],
                    'reference_type' => 'sale',
                    'reference_id' => $sale->id,
                    'batch_id' => $itemData['batch_id'],
                    'unit_cost' => $itemData['unit_cost'],
                    'performed_by' => $user->id,
                ]);
            }

            return $sale;
        });

        return response()->json(['data' => $sale->only(self::FIELDS)], 201);
    }
}
