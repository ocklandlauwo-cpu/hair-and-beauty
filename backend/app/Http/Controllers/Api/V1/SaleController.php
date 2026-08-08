<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreSaleRequest;
use App\Models\Location;
use App\Models\Product;
use App\Models\Sale;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'sold_by', 'client_id', 'payment_method',
        'total_amount', 'discount_amount', 'is_reverted', 'sale_date'];

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Sale::class);

        $dateFrom = $request->query('date_from', now()->startOfMonth()->toDateString());
        $dateTo   = $request->query('date_to',   now()->toDateString());

        $sales = Sale::with(['location:id,name', 'client:id,name'])
            ->when($request->query('location_id'), fn ($q, $v) => $q->where('location_id', $v))
            ->whereDate('sale_date', '>=', $dateFrom)
            ->whereDate('sale_date', '<=', $dateTo)
            ->latest('sale_date')
            ->latest('id')
            ->paginate(100);

        return response()->json($sales->through(fn ($s) => array_merge(
            $s->only(self::FIELDS),
            [
                'location_name' => $s->location?->name ?? '—',
                'client_name'   => $s->client?->name,
            ],
        )));
    }

    public function analysis(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Sale::class);

        $request->validate([
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'date_from'   => ['nullable', 'date'],
            'date_to'     => ['nullable', 'date'],
            'search'      => ['nullable', 'string', 'max:255'],
            'page'        => ['nullable', 'integer', 'min:1'],
        ]);

        $dateFrom   = $request->query('date_from', now()->startOfMonth()->toDateString());
        $dateTo     = $request->query('date_to',   now()->toDateString());
        $locationId = $request->query('location_id');

        $rows = DB::table('sale_items as si')
            ->join('sales as s', 's.id', '=', 'si.sale_id')
            ->join('products as p', 'p.id', '=', 'si.product_id')
            ->where('s.is_reverted', false)
            ->whereDate('s.sale_date', '>=', $dateFrom)
            ->whereDate('s.sale_date', '<=', $dateTo)
            ->when($locationId, fn ($q, $v) => $q->where('s.location_id', $v))
            ->when($request->query('search'), fn ($q, $v) => $q->where('p.name', 'ilike', "%{$v}%"))
            ->groupBy('p.id', 'p.name')
            ->orderBy('p.name')
            ->select('p.id as product_id', 'p.name as product_name', DB::raw('SUM(si.quantity) as quantity_sold'))
            ->paginate(50);

        $shopLabel = $locationId ? Location::find($locationId)?->name : null;

        return response()->json([
            'data' => collect($rows->items())->map(fn ($row) => [
                'product_id'    => $row->product_id,
                'product_name'  => $row->product_name,
                'quantity_sold' => (int) $row->quantity_sold,
                'shop'          => $shopLabel ?? 'All Shops',
            ]),
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page'    => $rows->lastPage(),
                'per_page'     => $rows->perPage(),
                'total'        => $rows->total(),
            ],
        ]);
    }

    public function show(Sale $sale): JsonResponse
    {
        $this->authorize('viewAny', Sale::class);

        $sale->load('items.product');

        return response()->json(['data' => array_merge(
            $sale->only(self::FIELDS),
            ['items' => $sale->items->map(fn ($item) => [
                'id'           => $item->id,
                'product_id'   => $item->product_id,
                'product_name' => $item->product?->name ?? '—',
                'batch_id'     => $item->batch_id,
                'quantity'     => $item->quantity,
                'unit_price'   => $item->unit_price,
                'price_tier'   => $item->price_tier,
            ])],
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
                $defaultPrice = $product->priceFor($item['quantity']);
                $costFloor = (float) ($product->latest_cost ?? 0);
                $unitPrice = (isset($item['unit_price']) && $item['unit_price'] !== null)
                    ? max((float) $item['unit_price'], $costFloor)
                    : $defaultPrice;
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
