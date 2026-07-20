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

it('reconciliation_date is returned as a plain date string with no time component', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'RDShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    Sanctum::actingAs($seller);
    $locationIdsJson = json_encode([$shopId]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $expectedDate = today()->toDateString();

        $createRes = $this->postJson('/api/v1/reconciliations', [
            'reconciliation_date' => $expectedDate,
            'total_sold_amount'   => 50000,
        ])->assertCreated();

        expect($createRes->json('data.reconciliation_date'))->toBe($expectedDate);

        $listRes = $this->getJson('/api/v1/reconciliations')->assertOk();
        $row = collect($listRes->json('data'))->firstWhere('location_id', $shopId);

        expect($row['reconciliation_date'])->toBe($expectedDate);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('admin can filter reconciliation history by shop', function () {
    $shop1Id = DB::table('locations')->insertGetId(['name' => 'RFShop1'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shop2Id = DB::table('locations')->insertGetId(['name' => 'RFShop2'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $seller1 = User::factory()->seller()->create(['location_id' => $shop1Id]);
    $seller2 = User::factory()->seller()->create(['location_id' => $shop2Id]);
    $admin   = User::factory()->admin()->create();

    DB::table('reconciliations')->insert([
        'location_id' => $shop1Id, 'seller_id' => $seller1->id,
        'reconciliation_date' => today(), 'total_sold_amount' => 10000,
        'created_at' => now(), 'updated_at' => now(),
    ]);
    DB::table('reconciliations')->insert([
        'location_id' => $shop2Id, 'seller_id' => $seller2->id,
        'reconciliation_date' => today(), 'total_sold_amount' => 20000,
        'created_at' => now(), 'updated_at' => now(),
    ]);

    Sanctum::actingAs($admin);
    $response = $this->getJson("/api/v1/reconciliations?location_id={$shop1Id}")->assertOk();

    $rows = collect($response->json('data'));
    expect($rows->pluck('location_id')->unique()->all())->toBe([$shop1Id]);
});

it('store_keeper cannot submit a reconciliation', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'RS'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->storeKeeper()->create(['location_id' => $shopId]));

    $this->postJson('/api/v1/reconciliations', ['reconciliation_date' => today()->toDateString(), 'total_sold_amount' => 100])
        ->assertForbidden();
});
