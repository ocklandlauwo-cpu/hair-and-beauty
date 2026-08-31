<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreProviderRequest;
use App\Http\Requests\Api\V1\UpdateProviderRequest;
use App\Models\Provider;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;

class ProviderController extends Controller
{
    private const FIELDS = ['id', 'name', 'phone', 'is_active'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Provider::class);

        return response()->json([
            'data' => Provider::orderBy('name')->get()->map->only(self::FIELDS),
        ]);
    }

    public function store(StoreProviderRequest $request): JsonResponse
    {
        $provider = Provider::create($request->validated());

        return response()->json(['data' => $provider->only(self::FIELDS)], 201);
    }

    public function update(UpdateProviderRequest $request, Provider $provider): JsonResponse
    {
        $provider->update($request->validated());

        return response()->json(['data' => $provider->only(self::FIELDS)]);
    }

    public function destroy(Provider $provider): JsonResponse
    {
        $this->authorize('delete', $provider);

        try {
            $provider->delete();
        } catch (QueryException $e) {
            // 23503 = foreign_key_violation, 23001 = restrict_violation (explicit ->restrictOnDelete())
            if (str_contains($e->getMessage(), '23503') || str_contains($e->getMessage(), '23001')) {
                return response()->json([
                    'message' => 'Cannot delete this provider because it has existing saloon sales.',
                ], 422);
            }
            throw $e;
        }

        return response()->json(['message' => 'Provider deleted']);
    }
}
