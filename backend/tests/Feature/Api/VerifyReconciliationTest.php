<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can verify a pending reconciliation', function () {
    $shopId = DB::table('locations')->insertGetId([
        'name' => 'VRShop' . uniqid(),
        'type' => 'shop',
        'geofence_radius_m' => 100,
        'is_active' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    $admin = User::factory()->create(['role' => 'admin']);
    $locationIdsJson = json_encode([$shopId]);

    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");
    Sanctum::actingAs($seller);
    try {
        $rec = $this->postJson('/api/v1/reconciliations', [
            'reconciliation_date' => today()->toDateString(),
            'total_sold_amount'   => 200000,
        ])->assertCreated()->json('data');
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }

    DB::statement("SELECT set_config('app.role', 'admin', false)");
    Sanctum::actingAs($admin);
    $this->postJson("/api/v1/reconciliations/{$rec['id']}/verify")
        ->assertOk()
        ->assertJsonPath('data.verified_by', $admin->id)
        ->assertJsonStructure(['data' => ['id', 'verified_by', 'verified_at']]);
});

it('seller cannot verify a reconciliation', function () {
    $shopId = DB::table('locations')->insertGetId([
        'name' => 'VRShop2' . uniqid(),
        'type' => 'shop',
        'geofence_radius_m' => 100,
        'is_active' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    $locationIdsJson = json_encode([$shopId]);

    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");
    Sanctum::actingAs($seller);
    try {
        $rec = $this->postJson('/api/v1/reconciliations', [
            'reconciliation_date' => today()->toDateString(),
            'total_sold_amount'   => 100000,
        ])->assertCreated()->json('data');

        $this->postJson("/api/v1/reconciliations/{$rec['id']}/verify")
            ->assertForbidden();
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('cannot verify an already-verified reconciliation', function () {
    $shopId = DB::table('locations')->insertGetId([
        'name' => 'VRShop3' . uniqid(),
        'type' => 'shop',
        'geofence_radius_m' => 100,
        'is_active' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    $admin = User::factory()->create(['role' => 'admin']);
    $locationIdsJson = json_encode([$shopId]);

    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");
    Sanctum::actingAs($seller);
    try {
        $rec = $this->postJson('/api/v1/reconciliations', [
            'reconciliation_date' => today()->toDateString(),
            'total_sold_amount'   => 50000,
        ])->assertCreated()->json('data');
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }

    DB::statement("SELECT set_config('app.role', 'admin', false)");
    Sanctum::actingAs($admin);
    $this->postJson("/api/v1/reconciliations/{$rec['id']}/verify")->assertOk();
    $this->postJson("/api/v1/reconciliations/{$rec['id']}/verify")->assertStatus(422);
});
