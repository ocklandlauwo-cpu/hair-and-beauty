<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreBatchRequest;
use App\Models\Product;
use Illuminate\Http\JsonResponse;

class BatchController extends Controller
{
    private const FIELDS = ['id', 'product_id', 'batch_number', 'expiry_date', 'notes'];

    public function index(Product $product): JsonResponse
    {
        return response()->json([
            'data' => $product->batches()->orderByDesc('created_at')->get()->map->only(self::FIELDS),
        ]);
    }

    public function store(StoreBatchRequest $request, Product $product): JsonResponse
    {
        $batch = $product->batches()->create($request->validated());

        return response()->json(['data' => $batch->only(self::FIELDS)], 201);
    }
}
