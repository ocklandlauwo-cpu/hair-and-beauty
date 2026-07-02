<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Category::orderBy('name')->get()->map->only(['id', 'name']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Category::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', 'unique:categories,name'],
        ]);

        $category = Category::create($data);

        return response()->json(['data' => $category->only(['id', 'name'])], 201);
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        $this->authorize('update', $category);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', 'unique:categories,name,'.$category->id],
        ]);

        $category->update($data);

        return response()->json(['data' => $category->only(['id', 'name'])]);
    }
}
