<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Location;
use Illuminate\Http\JsonResponse;

class LocationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Location::active()->orderBy('type')->orderBy('name')->get()
                ->map->only(['id', 'name', 'type', 'geofence_radius_m', 'is_active']),
        ]);
    }
}
