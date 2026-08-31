<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreSaloonServiceRequest;
use App\Http\Requests\Api\V1\UpdateSaloonServiceRequest;
use App\Models\SaloonService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;

class SaloonServiceController extends Controller
{
    private const FIELDS = ['id', 'name', 'is_active'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', SaloonService::class);

        return response()->json([
            'data' => SaloonService::orderBy('name')->get()->map->only(self::FIELDS),
        ]);
    }

    public function store(StoreSaloonServiceRequest $request): JsonResponse
    {
        $service = SaloonService::create($request->validated());

        return response()->json(['data' => $service->only(self::FIELDS)], 201);
    }

    public function update(UpdateSaloonServiceRequest $request, SaloonService $saloonService): JsonResponse
    {
        $saloonService->update($request->validated());

        return response()->json(['data' => $saloonService->only(self::FIELDS)]);
    }

    public function destroy(SaloonService $saloonService): JsonResponse
    {
        $this->authorize('delete', $saloonService);

        try {
            $saloonService->delete();
        } catch (QueryException $e) {
            // 23503 = foreign_key_violation, 23001 = restrict_violation (explicit ->restrictOnDelete())
            if (str_contains($e->getMessage(), '23503') || str_contains($e->getMessage(), '23001')) {
                return response()->json([
                    'message' => 'Cannot delete this saloon service because it has existing saloon sales.',
                ], 422);
            }
            throw $e;
        }

        return response()->json(['message' => 'Saloon service deleted']);
    }
}
