<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreProductRequest;
use App\Http\Requests\Api\V1\UpdateProductRequest;
use App\Models\Product;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    private const FIELDS = ['id', 'category_id', 'name', 'sku', 'unit', 'wholesale_threshold',
        'wholesale_price', 'retail_price', 'latest_cost', 'image_path', 'is_active'];

    public function index(Request $request): JsonResponse
    {
        $query = Product::with('category')->orderBy('name');

        if ($search = $request->query('search')) {
            $query->where('name', 'ilike', "%{$search}%");
        }

        $perPage = min((int) ($request->query('per_page') ?? 50), 500);
        $products = $query->paginate($perPage);

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

        try {
            $product->delete();
        } catch (QueryException $e) {
            // FK constraint — product has linked sales, purchases, or movements
            if (str_contains($e->getMessage(), '23503')) {
                return response()->json([
                    'message' => 'Cannot delete this product because it has existing sales or purchase records.',
                ], 422);
            }
            throw $e;
        }

        return response()->json(['message' => 'Product deleted']);
    }
}
