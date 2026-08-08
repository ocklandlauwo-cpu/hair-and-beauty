<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function salesAnalysisFixtures(): array
{
    $shopA = DB::table('locations')->insertGetId(['name' => 'SAAShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shopB = DB::table('locations')->insertGetId(['name' => 'SABShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId = DB::table('categories')->insertGetId(['name' => 'SACat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);

    $admin = User::factory()->admin()->create();
    $storeKeeper = User::factory()->storeKeeper()->create();
    $seller = User::factory()->seller()->create(['location_id' => $shopA]);

    $alpha = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'Analysis Product Alpha', 'wholesale_price' => 1000, 'retail_price' => 1500, 'created_at' => now(), 'updated_at' => now()]);
    $beta  = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'Analysis Product Beta',  'wholesale_price' => 500,  'retail_price' => 800,  'created_at' => now(), 'updated_at' => now()]);

    // Shop A: 5 Alpha sold today (kept)
    $saleA1 = DB::table('sales')->insertGetId(['location_id' => $shopA, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 7500, 'discount_amount' => 0, 'is_reverted' => false, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleA1, 'product_id' => $alpha, 'quantity' => 5, 'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now()]);

    // Shop A: 100 Alpha sold today but REVERTED — must be excluded
    $saleA2 = DB::table('sales')->insertGetId(['location_id' => $shopA, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 150000, 'discount_amount' => 0, 'is_reverted' => true, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleA2, 'product_id' => $alpha, 'quantity' => 100, 'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now()]);

    // Shop B: 2 Alpha sold today (kept)
    $saleB1 = DB::table('sales')->insertGetId(['location_id' => $shopB, 'sold_by' => $admin->id, 'payment_method' => 'nmb', 'total_amount' => 3000, 'discount_amount' => 0, 'is_reverted' => false, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleB1, 'product_id' => $alpha, 'quantity' => 2, 'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now()]);

    // Shop A: 3 Beta sold today (kept)
    $saleA3 = DB::table('sales')->insertGetId(['location_id' => $shopA, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 2400, 'discount_amount' => 0, 'is_reverted' => false, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleA3, 'product_id' => $beta, 'quantity' => 3, 'unit_price' => 800, 'unit_cost' => 500, 'price_tier' => 'retail', 'created_at' => now()]);

    // Shop A: 50 Beta sold 60 days ago (kept in the table, but outside a "last 7 days" filter)
    $saleOld = DB::table('sales')->insertGetId(['location_id' => $shopA, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 40000, 'discount_amount' => 0, 'is_reverted' => false, 'sale_date' => today()->subDays(60), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleOld, 'product_id' => $beta, 'quantity' => 50, 'unit_price' => 800, 'unit_cost' => 500, 'price_tier' => 'retail', 'created_at' => now()]);

    return compact('shopA', 'shopB', 'alpha', 'beta', 'admin', 'storeKeeper', 'seller');
}

it('sums quantity across all shops when no location filter is applied, excluding reverted sales', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson('/api/v1/sales/analysis?date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk()
        ->assertJsonStructure(['data' => [['product_id', 'product_name', 'quantity_sold', 'shop']], 'meta']);

    $rows = collect($response->json('data'));
    $alphaRow = $rows->firstWhere('product_id', $f['alpha']);

    expect($alphaRow['quantity_sold'])->toBe(7); // 5 (shop A) + 2 (shop B), 100 reverted excluded
    expect($alphaRow['shop'])->toBe('All Shops');
});

it('location_id filter narrows totals to that shop and labels the shop by name', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);
    $shopAName = DB::table('locations')->where('id', $f['shopA'])->value('name');

    $response = $this->getJson('/api/v1/sales/analysis?location_id='.$f['shopA'].'&date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk();

    $alphaRow = collect($response->json('data'))->firstWhere('product_id', $f['alpha']);

    expect($alphaRow['quantity_sold'])->toBe(5); // only shop A's non-reverted sale
    expect($alphaRow['shop'])->toBe($shopAName);
});

it('search filters by partial, case-insensitive product name', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson('/api/v1/sales/analysis?search=alpha&date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk();

    $names = collect($response->json('data'))->pluck('product_name');

    expect($names)->toContain('Analysis Product Alpha');
    expect($names)->not->toContain('Analysis Product Beta');
});

it('date range filter excludes sales outside the window', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson('/api/v1/sales/analysis?date_from='.today()->subDays(7)->toDateString().'&date_to='.today()->toDateString())
        ->assertOk();

    $betaRow = collect($response->json('data'))->firstWhere('product_id', $f['beta']);

    expect($betaRow['quantity_sold'])->toBe(3); // only today's 3, the 50-sold-60-days-ago is excluded
});

it('results are sorted by product name A-Z', function () {
    $f = salesAnalysisFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson('/api/v1/sales/analysis?date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk();

    $names = collect($response->json('data'))->pluck('product_name')->values()->all();

    expect($names)->toBe(collect($names)->sort()->values()->all());
});

it('store_keeper and seller can both access the endpoint', function () {
    $f = salesAnalysisFixtures();

    Sanctum::actingAs($f['storeKeeper']);
    $this->getJson('/api/v1/sales/analysis')->assertOk();

    Sanctum::actingAs($f['seller']);
    $this->getJson('/api/v1/sales/analysis')->assertOk();
});
