<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreSaloonSaleRequest;
use App\Models\SaloonSale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaloonSaleController extends Controller
{
    private function present(SaloonSale $sale): array
    {
        return [
            'id'            => $sale->id,
            'sale_date'     => $sale->sale_date->format('Y-m-d'),
            'provider_name' => $sale->provider?->name ?? '—',
            'service_name'  => $sale->service?->name ?? '—',
            'amount'        => $sale->amount,
            'location_name' => $sale->location?->name ?? '—',
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', SaloonSale::class);

        $dateFrom = $request->query('date_from', now()->startOfMonth()->toDateString());
        $dateTo   = $request->query('date_to',   now()->toDateString());

        $sales = SaloonSale::with(['location:id,name', 'provider:id,name', 'service:id,name'])
            ->when($request->query('location_id'), fn ($q, $v) => $q->where('location_id', $v))
            ->whereDate('sale_date', '>=', $dateFrom)
            ->whereDate('sale_date', '<=', $dateTo)
            ->latest('sale_date')
            ->latest('id')
            ->paginate(50);

        $paged = $sales->through(fn (SaloonSale $s) => $this->present($s));

        return response()->json([
            'data' => $paged->items(),
            'meta' => [
                'current_page' => $paged->currentPage(),
                'last_page'    => $paged->lastPage(),
                'per_page'     => $paged->perPage(),
                'total'        => $paged->total(),
            ],
        ]);
    }

    public function store(StoreSaloonSaleRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $locationId = ($user->role === 'admin' && ! empty($validated['location_id']))
            ? $validated['location_id']
            : $user->location_id;

        $sale = SaloonSale::create([
            'location_id'       => $locationId,
            'provider_id'       => $validated['provider_id'],
            'saloon_service_id' => $validated['saloon_service_id'],
            'amount'            => $validated['amount'],
            'sale_date'         => $validated['sale_date'],
            'created_by'        => $user->id,
        ]);

        $sale->load(['location:id,name', 'provider:id,name', 'service:id,name']);

        return response()->json(['data' => $this->present($sale)], 201);
    }
}
