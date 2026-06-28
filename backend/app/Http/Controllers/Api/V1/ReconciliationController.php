<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreReconciliationRequest;
use App\Models\Reconciliation;
use Illuminate\Http\JsonResponse;

class ReconciliationController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'seller_id', 'reconciliation_date',
        'total_sold_amount', 'receipt_path', 'notes',
        'verified_by', 'verified_at'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Reconciliation::class);
        $recs = Reconciliation::latest()->paginate(50);

        return response()->json($recs->through(fn ($r) => $r->only(self::FIELDS)));
    }

    public function store(StoreReconciliationRequest $request): JsonResponse
    {
        $user = $request->user();
        $rec = Reconciliation::create(array_merge($request->validated(), [
            'location_id' => $user->location_id,
            'seller_id' => $user->id,
        ]));

        return response()->json(['data' => $rec->only(self::FIELDS)], 201);
    }
}
