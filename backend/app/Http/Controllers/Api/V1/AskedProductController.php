<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreAskedProductRequest;
use App\Models\AskedProduct;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AskedProductController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'product_name', 'times_asked', 'created_at', 'updated_at'];

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', AskedProduct::class);

        $user  = $request->user();
        $query = AskedProduct::with('location')->orderByDesc('times_asked')->orderByDesc('updated_at');

        if ($user->role === 'seller') {
            $query->where('location_id', $user->location_id);
        } elseif ($request->filled('location_id')) {
            $query->where('location_id', $request->integer('location_id'));
        }

        $perPage = min((int) ($request->query('per_page') ?? 50), 500);
        $askedProducts = $query->paginate($perPage);

        return response()->json([
            'data' => $askedProducts->map(fn ($a) => array_merge(
                $a->only(self::FIELDS),
                ['location_name' => $a->location?->name],
            )),
            'meta' => [
                'current_page' => $askedProducts->currentPage(),
                'last_page'    => $askedProducts->lastPage(),
                'per_page'     => $askedProducts->perPage(),
                'total'        => $askedProducts->total(),
            ],
        ]);
    }

    public function store(StoreAskedProductRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $locationId = in_array($user->role, ['admin', 'store_keeper'])
            ? $validated['location_id']
            : $user->location_id;

        $name = trim($validated['product_name']);

        $existing = AskedProduct::where('location_id', $locationId)
            ->whereRaw('LOWER(TRIM(product_name)) = LOWER(?)', [$name])
            ->first();

        if ($existing) {
            $existing->increment('times_asked');
            $existing->touch();
            $existing->load('location');

            return response()->json(['data' => array_merge(
                $existing->only(self::FIELDS),
                ['location_name' => $existing->location?->name],
            )]);
        }

        $askedProduct = AskedProduct::create([
            'location_id'  => $locationId,
            'product_name' => $name,
            'times_asked'  => 1,
            'created_by'   => $user->id,
        ]);
        $askedProduct->load('location');

        return response()->json(['data' => array_merge(
            $askedProduct->only(self::FIELDS),
            ['location_name' => $askedProduct->location?->name],
        )], 201);
    }

    public function destroy(AskedProduct $askedProduct): JsonResponse
    {
        $this->authorize('delete', $askedProduct);
        $askedProduct->delete();

        return response()->json(['message' => 'Asked product deleted']);
    }
}
