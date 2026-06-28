<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function attendanceShop(): array
{
    $shopLat = -6.7924;
    $shopLng = 39.2083;
    $shopId  = DB::table('locations')->insertGetId([
        'name'               => 'AttShop'.uniqid(),
        'type'               => 'shop',
        'geofence_lat'       => $shopLat,
        'geofence_lng'       => $shopLng,
        'geofence_radius_m'  => 100,
        'is_active'          => true,
        'created_at'         => now(),
        'updated_at'         => now(),
    ]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    return compact('shopId', 'shopLat', 'shopLng', 'seller');
}

it('seller can clock in and is_within_geofence is true when within 100m', function () {
    $f = attendanceShop();
    Sanctum::actingAs($f['seller']);
    $locationIdsJson = json_encode([$f['shopId']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->postJson('/api/v1/attendance', [
            'action'    => 'clock_in',
            'latitude'  => $f['shopLat'] + 0.0005, // ~55m — within 100m geofence
            'longitude' => $f['shopLng'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.action', 'clock_in')
            ->assertJsonPath('data.is_within_geofence', true);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('clock_in is marked outside geofence when beyond radius', function () {
    $f = attendanceShop();
    Sanctum::actingAs($f['seller']);
    $locationIdsJson = json_encode([$f['shopId']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->postJson('/api/v1/attendance', [
            'action'    => 'clock_out',
            'latitude'  => $f['shopLat'] + 0.01, // ~1.1km — outside
            'longitude' => $f['shopLng'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.is_within_geofence', false);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('attendance requires a valid action', function () {
    $f = attendanceShop();
    Sanctum::actingAs($f['seller']);

    $this->postJson('/api/v1/attendance', [
        'action'    => 'invalid_action',
        'latitude'  => $f['shopLat'],
        'longitude' => $f['shopLng'],
    ])->assertUnprocessable();
});

it('admin can list all attendance records', function () {
    Sanctum::actingAs(User::factory()->admin()->create());
    $this->getJson('/api/v1/attendance')->assertOk()->assertJsonStructure(['data', 'meta']);
});
