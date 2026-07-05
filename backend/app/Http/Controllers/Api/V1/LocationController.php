<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Location::active()->orderBy('type')->orderBy('name')->get()
                ->map->only(['id', 'name', 'type', 'geofence_lat', 'geofence_lng', 'geofence_radius_m', 'is_active']),
        ]);
    }

    public function update(Request $request, Location $location): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $data = $request->validate([
            'geofence_lat'      => ['required', 'numeric', 'between:-90,90'],
            'geofence_lng'      => ['required', 'numeric', 'between:-180,180'],
            'geofence_radius_m' => ['nullable', 'integer', 'min:100', 'max:50000'],
        ]);

        $location->update([
            'geofence_lat'      => $data['geofence_lat'],
            'geofence_lng'      => $data['geofence_lng'],
            'geofence_radius_m' => $data['geofence_radius_m'] ?? 2000,
        ]);

        return response()->json([
            'data' => $location->only(['id', 'name', 'geofence_lat', 'geofence_lng', 'geofence_radius_m']),
        ]);
    }
}
