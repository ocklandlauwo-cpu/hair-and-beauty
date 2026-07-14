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

it('admin dashboard shows shop asset value floored at zero for negative stock', function () {
    $storeId = DB::table('locations')->insertGetId(['name' => 'AVStore'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shopId  = DB::table('locations')->insertGetId(['name' => 'AVShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId   = DB::table('categories')->insertGetId(['name' => 'AVCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $admin   = User::factory()->admin()->create();

    // Product with a known recent buying price (latest_cost) of 500
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'AVProduct', 'wholesale_price' => 800, 'retail_price' => 1000, 'latest_cost' => 500, 'created_at' => now(), 'updated_at' => now()]);

    // Shop has 10 units on hand -> expected asset value contribution = 10 * 500 = 5000
    DB::table('stock_movements')->insert(['product_id' => $prodId, 'location_id' => $shopId, 'movement_type' => 'distribution_in', 'quantity' => 10, 'reference_type' => 'test', 'reference_id' => 1, 'unit_cost' => 500, 'performed_by' => $admin->id, 'created_at' => now()]);

    // Store also holds stock of this product, but the store is excluded from shop asset value
    DB::table('stock_movements')->insert(['product_id' => $prodId, 'location_id' => $storeId, 'movement_type' => 'purchase', 'quantity' => 100, 'reference_type' => 'test', 'reference_id' => 2, 'unit_cost' => 500, 'performed_by' => $admin->id, 'created_at' => now()]);

    // Second product, oversold at the shop (negative stock) -> must be floored to 0, not subtract from the shop's total
    $prod2Id = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'AVNegProduct', 'wholesale_price' => 600, 'retail_price' => 800, 'latest_cost' => 300, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('stock_movements')->insert(['product_id' => $prod2Id, 'location_id' => $shopId, 'movement_type' => 'sale', 'quantity' => -5, 'reference_type' => 'test', 'reference_id' => 3, 'unit_cost' => 300, 'performed_by' => $admin->id, 'created_at' => now()]);

    Sanctum::actingAs($admin);

    $response = $this->getJson('/api/v1/dashboard')
        ->assertOk()
        ->assertJsonPath('data.role', 'admin')
        ->assertJsonStructure(['data' => ['asset_value' => ['total', 'by_shop' => [['location_id', 'location_name', 'total']]]]]);

    $byShop = collect($response->json('data.asset_value.by_shop'));
    $shopRow = $byShop->firstWhere('location_id', $shopId);

    expect($shopRow)->not->toBeNull();
    expect((float) $shopRow['total'])->toBe(5000.0);
});

it('admin dashboard shows store asset value floored at zero for negative stock', function () {
    $storeId = DB::table('locations')->insertGetId(['name' => 'SAVStore'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shopId  = DB::table('locations')->insertGetId(['name' => 'SAVShop'.uniqid(),  'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId   = DB::table('categories')->insertGetId(['name' => 'SAVCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $admin   = User::factory()->admin()->create();

    // Product with a known recent buying price (latest_cost) of 400
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'SAVProduct', 'wholesale_price' => 700, 'retail_price' => 900, 'latest_cost' => 400, 'created_at' => now(), 'updated_at' => now()]);

    // Store has 20 units on hand -> expected contribution = 20 * 400 = 8000
    DB::table('stock_movements')->insert(['product_id' => $prodId, 'location_id' => $storeId, 'movement_type' => 'purchase', 'quantity' => 20, 'reference_type' => 'test', 'reference_id' => 1, 'unit_cost' => 400, 'performed_by' => $admin->id, 'created_at' => now()]);

    // Shop also holds stock of this product, but the shop is excluded from store asset value
    DB::table('stock_movements')->insert(['product_id' => $prodId, 'location_id' => $shopId, 'movement_type' => 'distribution_in', 'quantity' => 50, 'reference_type' => 'test', 'reference_id' => 2, 'unit_cost' => 400, 'performed_by' => $admin->id, 'created_at' => now()]);

    // Second product, oversold at the store (negative stock) -> must be floored to 0
    $prod2Id = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'SAVNegProduct', 'wholesale_price' => 500, 'retail_price' => 650, 'latest_cost' => 250, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('stock_movements')->insert(['product_id' => $prod2Id, 'location_id' => $storeId, 'movement_type' => 'distribution_out', 'quantity' => -3, 'reference_type' => 'test', 'reference_id' => 3, 'unit_cost' => 250, 'performed_by' => $admin->id, 'created_at' => now()]);

    Sanctum::actingAs($admin);

    $response = $this->getJson('/api/v1/dashboard')
        ->assertOk()
        ->assertJsonPath('data.role', 'admin')
        ->assertJsonStructure(['data' => ['store_asset_value' => ['total', 'by_location' => [['location_id', 'location_name', 'total']]]]]);

    $byLocation = collect($response->json('data.store_asset_value.by_location'));
    $storeRow = $byLocation->firstWhere('location_id', $storeId);

    expect($storeRow)->not->toBeNull();
    expect((float) $storeRow['total'])->toBe(8000.0);
});
