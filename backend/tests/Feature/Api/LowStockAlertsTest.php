<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('sellers see low stock only for their own shop while admins see every shop', function () {
    $catId  = DB::table('categories')->insertGetId(['name' => 'LC'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'LP'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
    $admin  = User::factory()->admin()->create();

    $shops = [];
    foreach (['A', 'B'] as $n) {
        $shopId = DB::table('locations')->insertGetId(['name' => "LShop{$n}".uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $seller = User::factory()->seller()->create(['location_id' => $shopId]);

        // 90 sold in the last 90 days (1/day) with only 5 left → 5 days of cover
        DB::table('stock_movements')->insert(['product_id' => $prodId, 'location_id' => $shopId, 'movement_type' => 'purchase', 'quantity' => 5, 'reference_type' => 'purchase', 'reference_id' => 1, 'unit_cost' => 80, 'performed_by' => $admin->id, 'created_at' => now()]);
        $saleId = DB::table('sales')->insertGetId(['location_id' => $shopId, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 13500, 'discount_amount' => 0, 'is_reverted' => false, 'sale_date' => today()->subDays(3), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('sale_items')->insert(['sale_id' => $saleId, 'product_id' => $prodId, 'quantity' => 90, 'unit_price' => 150, 'unit_cost' => 80, 'price_tier' => 'retail', 'created_at' => now()]);

        $shops[] = ['id' => $shopId, 'seller' => $seller];
    }

    Sanctum::actingAs($shops[0]['seller']);
    $sellerRows = collect($this->getJson('/api/v1/stock/alerts/low')->assertOk()->json('data'));
    expect($sellerRows->pluck('location_id')->unique()->values()->all())->toBe([$shops[0]['id']]);
    expect($sellerRows->where('product_id', $prodId))->toHaveCount(1);

    Sanctum::actingAs($admin);
    $adminRows = collect($this->getJson('/api/v1/stock/alerts/low')->assertOk()->json('data'))->where('product_id', $prodId);
    expect($adminRows->pluck('location_id')->sort()->values()->all())->toBe([$shops[0]['id'], $shops[1]['id']]);
});
