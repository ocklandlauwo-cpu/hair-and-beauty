<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreProductRequest;
use App\Http\Requests\Api\V1\UpdateProductRequest;
use App\Models\Product;
use Illuminate\Http\JsonResponse;

class ProductController extends Controller
{
    private const FIELDS = ['id', 'category_id', 'name', 'sku', 'unit', 'wholesale_threshold',
        'wholesale_price', 'retail_price', 'latest_cost', 'image_path', 'is_active'];

    public function index(): JsonResponse
    {
        $products = Product::with('category')
            ->orderBy('name')
            ->paginate(50);

        return response()->json([
            'data' => $products->getCollection()->map(fn (Product $p) => array_merge(
                $p->only(self::FIELDS),
                ['category_name' => $p->category?->name]
            )),
            'meta' => [
                'current_page' => $products->currentPage(),
                'last_page' => $products->lastPage(),
                'per_page' => $products->perPage(),
                'total' => $products->total(),
            ],
        ]);
    }

    public function store(StoreProductRequest $request): JsonResponse
    {
        $product = Product::create($request->validated());

        return response()->json(['data' => $product->fresh()->only(self::FIELDS)], 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json(['data' => array_merge(
            $product->only(self::FIELDS),
            ['category_name' => $product->category?->name]
        )]);
    }

    public function update(UpdateProductRequest $request, Product $product): JsonResponse
    {
        $product->update($request->validated());

        return response()->json(['data' => $product->fresh()->only(self::FIELDS)]);
    }

    public function destroy(Product $product): JsonResponse
    {
        $this->authorize('delete', $product);
        $product->delete();

        return response()->json(['message' => 'Product deleted']);
    }
}
