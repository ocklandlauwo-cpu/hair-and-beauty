<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function saloonRlsFixtures(): array
{
    $shopA = DB::table('locations')->insertGetId(['name' => 'RlsShopA'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shopB = DB::table('locations')->insertGetId(['name' => 'RlsShopB'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = User::factory()->admin()->create();
    $sellerA = User::factory()->seller()->create(['location_id' => $shopA]);

    DB::statement("SELECT set_config('app.role', 'admin', false)");
    $providerId = DB::table('providers')->insertGetId(['name' => 'RlsProvider', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'RlsService', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('saloon_sales')->insert(['location_id' => $shopA, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 5000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('saloon_sales')->insert(['location_id' => $shopB, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 7000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    Sanctum::actingAs($admin);

    return compact('shopA', 'shopB', 'admin', 'sellerA', 'providerId', 'serviceId');
}

it('seller only sees saloon_sales for their own shop via RLS', function () {
    $f = saloonRlsFixtures();
    Sanctum::actingAs($f['sellerA']);
    $locationIdsJson = json_encode([$f['shopA']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $rows = DB::table('saloon_sales')->get();
        expect($rows)->toHaveCount(1);
        expect((int) $rows->first()->location_id)->toBe($f['shopA']);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('admin sees all saloon_sales via RLS', function () {
    $f = saloonRlsFixtures();
    Sanctum::actingAs($f['admin']);
    DB::statement("SELECT set_config('app.role', 'admin', false)");

    try {
        expect(DB::table('saloon_sales')->count())->toBe(2);
    } finally {
        DB::unprepared('RESET app.role');
    }
});

it('seller cannot see saloon_tools rows via RLS even at their own shop', function () {
    $f = saloonRlsFixtures();
    DB::statement("SELECT set_config('app.role', 'admin', false)");
    DB::table('saloon_tools')->insert(['location_id' => $f['shopA'], 'name' => 'Dryer', 'quantity' => 1, 'unit_cost' => 10000, 'purchase_date' => today(), 'recorded_by' => $f['admin']->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    Sanctum::actingAs($f['sellerA']);
    $locationIdsJson = json_encode([$f['shopA']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        expect(DB::table('saloon_tools')->count())->toBe(0);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('seller can select providers and saloon_services (catalog read access)', function () {
    $f = saloonRlsFixtures();
    Sanctum::actingAs($f['sellerA']);
    $locationIdsJson = json_encode([$f['shopA']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        expect(DB::table('providers')->count())->toBe(1);
        expect(DB::table('saloon_services')->count())->toBe(1);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});
