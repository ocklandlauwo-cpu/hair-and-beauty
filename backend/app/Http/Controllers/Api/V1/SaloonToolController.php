<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreSaloonToolRequest;
use App\Models\SaloonTool;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaloonToolController extends Controller
{
    private function present(SaloonTool $tool): array
    {
        return [
            'id'             => $tool->id,
            'purchase_date'  => $tool->purchase_date->format('Y-m-d'),
            'location_name'  => $tool->location?->name ?? '—',
            'name'           => $tool->name,
            'quantity'       => $tool->quantity,
            'unit_cost'      => $tool->unit_cost,
            'total'          => round((float) $tool->quantity * (float) $tool->unit_cost, 2),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', SaloonTool::class);

        $tools = SaloonTool::with('location:id,name')
            ->when($request->query('location_id'), fn ($q, $v) => $q->where('location_id', $v))
            ->latest('purchase_date')
            ->latest('id')
            ->paginate(50);

        $paged = $tools->through(fn (SaloonTool $t) => $this->present($t));

        return response()->json([
            'data' => $paged->items(),
            'meta' => [
                'current_page' => $paged->currentPage(),
                'last_page'    => $paged->lastPage(),
                'per_page'     => $paged->perPage(),
                'total'        => $paged->total(),
            ],
        ], 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }

    public function store(StoreSaloonToolRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $tool = SaloonTool::create([
            'location_id'   => $validated['location_id'],
            'name'          => $validated['name'],
            'quantity'      => $validated['quantity'],
            'unit_cost'     => $validated['unit_cost'],
            'purchase_date' => $validated['purchase_date'],
            'recorded_by'   => $user->id,
        ]);

        $tool->load('location:id,name');

        return response()->json(['data' => $this->present($tool)], 201, [], JSON_PRESERVE_ZERO_FRACTION);
    }
}
