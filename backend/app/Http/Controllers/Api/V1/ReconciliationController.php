<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreReconciliationRequest;
use App\Models\Reconciliation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReconciliationController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'seller_id', 'reconciliation_date',
        'total_sold_amount', 'receipt_path', 'notes',
        'verified_by', 'verified_at'];

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Reconciliation::class);

        $recs = Reconciliation::with('location:id,name')
            ->when($request->query('location_id'), fn ($q, $v) => $q->where('location_id', $v))
            ->latest()
            ->paginate(50);

        return response()->json($recs->through(fn ($r) => array_merge(
            $r->only(self::FIELDS),
            [
                'reconciliation_date' => $r->reconciliation_date->format('Y-m-d'),
                'location_name'       => $r->location?->name,
            ],
        )));
    }

    public function store(StoreReconciliationRequest $request): JsonResponse
    {
        $user = $request->user();
        $rec = Reconciliation::create(array_merge($request->validated(), [
            'location_id' => $user->location_id,
            'seller_id' => $user->id,
        ]));

        return response()->json(['data' => array_merge(
            $rec->only(self::FIELDS),
            ['reconciliation_date' => $rec->reconciliation_date->format('Y-m-d')],
        )], 201);
    }
}
