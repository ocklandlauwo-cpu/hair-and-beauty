<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('seller cannot access fastest products report', function () {
    Sanctum::actingAs(User::factory()->seller()->create());

    $this->getJson('/api/v1/ai-reports/fastest-products')->assertForbidden();
});

it('admin sees fastest products ranked by velocity with stock runway', function () {
    $catId   = DB::table('categories')->insertGetId(['name' => 'FastCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $shopId  = DB::table('locations')->insertGetId(['name' => 'FastShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin   = User::factory()->admin()->create();

    // Fast mover: 20 units sold today, first (and only) sale today -> velocity 20/day
    $fastId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'FastMover', 'wholesale_price' => 1000, 'retail_price' => 1500, 'created_at' => now(), 'updated_at' => now()]);
    // Slow mover: 3 units sold today -> velocity 3/day
    $slowId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'SlowMover', 'wholesale_price' => 1000, 'retail_price' => 1500, 'created_at' => now(), 'updated_at' => now()]);

    // Stock: fast mover has 40 units on hand -> 40/20 = 2 days of stock left
    DB::table('stock_movements')->insert([
        ['product_id' => $fastId, 'location_id' => $shopId, 'movement_type' => 'purchase', 'quantity' => 40, 'reference_type' => 'test', 'reference_id' => 1, 'unit_cost' => 500, 'performed_by' => $admin->id, 'created_at' => now()],
        ['product_id' => $slowId, 'location_id' => $shopId, 'movement_type' => 'purchase', 'quantity' => 100, 'reference_type' => 'test', 'reference_id' => 2, 'unit_cost' => 500, 'performed_by' => $admin->id, 'created_at' => now()],
    ]);

    $fastSaleId = DB::table('sales')->insertGetId(['location_id' => $shopId, 'sold_by' => $admin->id, 'payment_method' => 'nmb', 'total_amount' => 30000, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $fastSaleId, 'product_id' => $fastId, 'quantity' => 20, 'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now()]);

    $slowSaleId = DB::table('sales')->insertGetId(['location_id' => $shopId, 'sold_by' => $admin->id, 'payment_method' => 'nmb', 'total_amount' => 4500, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $slowSaleId, 'product_id' => $slowId, 'quantity' => 3, 'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now()]);

    Sanctum::actingAs($admin);

    $response = $this->getJson('/api/v1/ai-reports/fastest-products?period=30d')
        ->assertOk()
        ->assertJsonStructure([
            'data' => [['product_id', 'product_name', 'category_name', 'units_sold', 'revenue', 'velocity', 'current_stock', 'days_of_stock_left']],
        ]);

    $rows = $response->json('data');
    expect($rows[0]['product_id'])->toBe($fastId);
    expect((float) $rows[0]['velocity'])->toBe(20.0);
    expect((int) $rows[0]['days_of_stock_left'])->toBe(2);
    expect($rows[1]['product_id'])->toBe($slowId);
});
