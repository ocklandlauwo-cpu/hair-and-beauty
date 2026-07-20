<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ClockAttendanceRequest;
use App\Models\Attendance;
use App\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AttendanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $paged = Attendance::with('user:id,name')
            ->when(
                $user->role === 'seller',
                fn ($q) => $q->where('user_id', $user->id)
            )
            ->latest('recorded_at')
            ->paginate(50)
            ->through(fn ($a) => array_merge(
                $a->only(['id', 'user_id', 'location_id', 'action',
                          'latitude', 'longitude', 'is_within_geofence', 'recorded_at']),
                ['user_name' => $a->user?->name ?? '—'],
            ));

        return response()->json([
            'data' => $paged->items(),
            'meta' => [
                'current_page' => $paged->currentPage(),
                'last_page' => $paged->lastPage(),
                'per_page' => $paged->perPage(),
                'total' => $paged->total(),
            ],
        ]);
    }

    public function store(ClockAttendanceRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $recordedAt = $validated['recorded_at'] ?? now();
        $sameDayActions = Attendance::where('user_id', $user->id)
            ->whereDate('recorded_at', Carbon::parse($recordedAt)->toDateString())
            ->pluck('action');

        if ($validated['action'] === 'clock_in' && $sameDayActions->contains('clock_in')) {
            return response()->json(['message' => 'You have already clocked in today.'], 422);
        }

        if ($validated['action'] === 'clock_out') {
            if (! $sameDayActions->contains('clock_in')) {
                return response()->json(['message' => 'You must clock in before you can clock out.'], 422);
            }
            if ($sameDayActions->contains('clock_out')) {
                return response()->json(['message' => 'You have already clocked out today.'], 422);
            }
        }

        $location = Location::find($user->location_id);

        $isWithinGeofence = false;
        $distanceM = null;

        if ($location && $location->geofence_lat !== null && $location->geofence_lng !== null) {
            $distanceM = $this->haversineDistance(
                (float) $validated['latitude'],
                (float) $validated['longitude'],
                (float) $location->geofence_lat,
                (float) $location->geofence_lng,
            );
            $isWithinGeofence = $distanceM <= $location->geofence_radius_m;

            if (! $isWithinGeofence) {
                $radiusKm = number_format($location->geofence_radius_m / 1000, 1);
                $distKm   = number_format($distanceM / 1000, 2);
                return response()->json([
                    'message'    => "You are {$distKm} km from your shop. You must be within {$radiusKm} km to check in or out.",
                    'distance_m' => round($distanceM, 1),
                ], 422);
            }
        }

        $attendance = Attendance::create([
            'user_id' => $user->id,
            'location_id' => $user->location_id,
            'action' => $validated['action'],
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'is_within_geofence' => $isWithinGeofence,
            'recorded_at' => $recordedAt,
        ]);

        return response()->json([
            'data' => [
                'id' => $attendance->id,
                'action' => $attendance->action,
                'is_within_geofence' => $attendance->is_within_geofence,
                'distance_m' => $distanceM !== null ? round($distanceM, 1) : null,
                'recorded_at' => $attendance->recorded_at,
            ],
        ], 201);
    }

    private function haversineDistance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $R = 6371000.0;
        $φ1 = deg2rad($lat1);
        $φ2 = deg2rad($lat2);
        $Δφ = deg2rad($lat2 - $lat1);
        $Δλ = deg2rad($lng2 - $lng1);
        $a = sin($Δφ / 2) ** 2 + cos($φ1) * cos($φ2) * sin($Δλ / 2) ** 2;

        return $R * 2.0 * atan2(sqrt($a), sqrt(1.0 - $a));
    }
}
