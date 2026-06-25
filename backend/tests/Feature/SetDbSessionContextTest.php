<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;

// Register a test-only route to inspect GUC values mid-request
beforeEach(function () {
    Route::middleware('api')->get('/_test/guc', function () {
        return response()->json([
            'user_id'      => DB::selectOne("SELECT current_setting('app.user_id', true) AS v")->v,
            'role'         => DB::selectOne("SELECT current_setting('app.role', true) AS v")->v,
            'location_ids' => DB::selectOne("SELECT current_setting('app.location_ids', true) AS v")->v,
        ]);
    });
});

it('sets guest GUCs for unauthenticated requests', function () {
    $this->getJson('/_test/guc')
        ->assertOk()
        ->assertJsonPath('user_id', '0')
        ->assertJsonPath('role', 'guest')
        ->assertJsonPath('location_ids', '[]');
});

it('sets user GUCs for an authenticated admin with no location', function () {
    $user = User::factory()->admin()->create();
    Sanctum::actingAs($user);

    $this->getJson('/_test/guc')
        ->assertOk()
        ->assertJsonPath('user_id', (string) $user->id)
        ->assertJsonPath('role', 'admin')
        ->assertJsonPath('location_ids', '[]');
});

it('sets location_ids GUC for a seller with a location', function () {
    $locationId = \Illuminate\Support\Facades\DB::table('locations')->insertGetId([
        'name' => 'Test Shop', 'type' => 'shop', 'geofence_radius_m' => 100,
        'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
    ]);
    $user = User::factory()->seller()->create(['location_id' => $locationId]);
    Sanctum::actingAs($user);

    $this->getJson('/_test/guc')
        ->assertOk()
        ->assertJsonPath('user_id', (string) $user->id)
        ->assertJsonPath('role', 'seller')
        ->assertJsonPath('location_ids', json_encode([$locationId]));
});
