<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin dashboard returns required keys', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->getJson('/api/v1/dashboard')
        ->assertOk()
        ->assertJsonPath('data.role', 'admin')
        ->assertJsonStructure([
            'data' => [
                'role',
                'sales'         => ['today', 'this_month'],
                'expenses'      => ['this_month'],
                'distributions' => ['pending'],
                'stock'         => ['expiry_alerts', 'low_stock_alerts'],
                'users'         => ['active'],
            ],
        ]);
});

it('store_keeper dashboard returns required keys', function () {
    $storeId = DB::table('locations')->insertGetId(['name' => 'DStore'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->storeKeeper()->create(['location_id' => $storeId]));

    $this->getJson('/api/v1/dashboard')
        ->assertOk()
        ->assertJsonPath('data.role', 'store_keeper')
        ->assertJsonStructure([
            'data' => [
                'role',
                'distributions' => ['pending', 'this_week'],
                'purchases'     => ['this_month_count'],
                'stock'         => ['expiry_alerts', 'low_stock_alerts'],
            ],
        ]);
});

it('seller dashboard returns required keys', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'DShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->seller()->create(['location_id' => $shopId]));
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    $locationIdsJson = json_encode([$shopId]);
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->getJson('/api/v1/dashboard')
            ->assertOk()
            ->assertJsonPath('data.role', 'seller')
            ->assertJsonStructure([
                'data' => [
                    'role',
                    'sales_today',
                    'sales_count_today',
                    'reconciliation_pending',
                    'low_stock_count',
                    'attendance_today',
                ],
            ]);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('dashboard returns today sales amount correctly', function () {
    $shopId  = DB::table('locations')->insertGetId(['name' => 'DS2'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $seller  = User::factory()->seller()->create(['location_id' => $shopId]);
    // Insert a sale for today
    DB::table('sales')->insert(['location_id' => $shopId, 'sold_by' => $seller->id, 'payment_method' => 'nmb', 'total_amount' => 25000, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs($seller);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    $locationIdsJson = json_encode([$shopId]);
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->getJson('/api/v1/dashboard')
            ->assertOk()
            ->assertJsonPath('data.sales_today', '25000.00')
            ->assertJsonPath('data.sales_count_today', 1);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});
