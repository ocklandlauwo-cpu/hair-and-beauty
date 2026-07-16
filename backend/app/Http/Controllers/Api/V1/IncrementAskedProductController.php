<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AskedProduct;
use Illuminate\Http\JsonResponse;

class IncrementAskedProductController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'product_name', 'times_asked', 'created_at', 'updated_at'];

    public function __invoke(AskedProduct $askedProduct): JsonResponse
    {
        $this->authorize('update', $askedProduct);

        $askedProduct->increment('times_asked');
        $askedProduct->touch();
        $askedProduct->load('location');

        return response()->json(['data' => array_merge(
            $askedProduct->only(self::FIELDS),
            ['location_name' => $askedProduct->location?->name],
        )]);
    }
}
