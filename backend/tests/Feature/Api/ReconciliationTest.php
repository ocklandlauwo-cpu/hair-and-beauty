<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('seller can submit a daily reconciliation', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'RecShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    Sanctum::actingAs($seller);
    $locationIdsJson = json_encode([$shopId]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->postJson('/api/v1/reconciliations', [
            'reconciliation_date' => today()->toDateString(),
            'total_sold_amount'   => 150000,
        ])
            ->assertCreated()
            ->assertJsonPath('data.total_sold_amount', '150000.00');
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('reconciliation is unique per shop per day', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'US'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    Sanctum::actingAs($seller);
    $locationIdsJson = json_encode([$shopId]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->postJson('/api/v1/reconciliations', ['reconciliation_date' => today()->toDateString(), 'total_sold_amount' => 100]);
        $this->postJson('/api/v1/reconciliations', ['reconciliation_date' => today()->toDateString(), 'total_sold_amount' => 200])
            ->assertStatus(422);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('store_keeper cannot submit a reconciliation', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'RS'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->storeKeeper()->create(['location_id' => $shopId]));

    $this->postJson('/api/v1/reconciliations', ['reconciliation_date' => today()->toDateString(), 'total_sold_amount' => 100])
        ->assertForbidden();
});
