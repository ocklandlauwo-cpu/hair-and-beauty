<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function purchaseForecastFixtures(): array
{
    $shopId = DB::table('locations')->insertGetId(['name' => 'PFShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId  = DB::table('categories')->insertGetId(['name' => 'PFCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $admin  = User::factory()->admin()->create();
    $storeKeeper = User::factory()->storeKeeper()->create();
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);

    // Product A: 90 units sold today (within the 90-day window) -> avg_daily = 90/90 = 1.0
    $prodA = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'PFProductA', 'wholesale_price' => 1000, 'retail_price' => 1500, 'created_at' => now(), 'updated_at' => now()]);
    $saleId = DB::table('sales')->insertGetId(['location_id' => $shopId, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 135000, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleId, 'product_id' => $prodA, 'quantity' => 90, 'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now()]);
    // 20 units currently on hand
    DB::table('stock_movements')->insert(['product_id' => $prodA, 'location_id' => $shopId, 'movement_type' => 'distribution_in', 'quantity' => 20, 'reference_type' => 'test', 'reference_id' => 1, 'unit_cost' => 1000, 'performed_by' => $admin->id, 'created_at' => now()]);

    // Product B: never sold at this shop, but has 5 units on hand
    $prodB = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'PFProductB', 'wholesale_price' => 500, 'retail_price' => 800, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('stock_movements')->insert(['product_id' => $prodB, 'location_id' => $shopId, 'movement_type' => 'distribution_in', 'quantity' => 5, 'reference_type' => 'test', 'reference_id' => 2, 'unit_cost' => 500, 'performed_by' => $admin->id, 'created_at' => now()]);

    // Product C: low sales (1 unit sold 90 days ago) but huge stock already on hand -> must not go negative
    $prodC = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'PFProductC', 'wholesale_price' => 300, 'retail_price' => 450, 'created_at' => now(), 'updated_at' => now()]);
    $saleId2 = DB::table('sales')->insertGetId(['location_id' => $shopId, 'sold_by' => $seller->id, 'payment_method' => 'cash', 'total_amount' => 450, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleId2, 'product_id' => $prodC, 'quantity' => 1, 'unit_price' => 450, 'unit_cost' => 300, 'price_tier' => 'retail', 'created_at' => now()]);
    DB::table('stock_movements')->insert(['product_id' => $prodC, 'location_id' => $shopId, 'movement_type' => 'distribution_in', 'quantity' => 500, 'reference_type' => 'test', 'reference_id' => 3, 'unit_cost' => 300, 'performed_by' => $admin->id, 'created_at' => now()]);

    return compact('shopId', 'prodA', 'prodB', 'prodC', 'admin', 'storeKeeper', 'seller');
}

it('admin gets correct forecast for a product with sales history and stock on hand', function () {
    $f = purchaseForecastFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson("/api/v1/purchases/forecast?location_id={$f['shopId']}&months=3")
        ->assertOk()
        ->assertJsonStructure(['data' => [['product_id', 'product_name', 'category_name', 'avg_daily_sales', 'current_stock', 'projected_need', 'suggested_purchase_qty']]]);

    $rows = collect($response->json('data'));
    $rowA = $rows->firstWhere('product_id', $f['prodA']);

    expect((float) $rowA['avg_daily_sales'])->toBe(1.0);
    expect((int) $rowA['current_stock'])->toBe(20);
    expect((int) $rowA['projected_need'])->toBe(90); // 1.0 * 30 * 3
    expect((int) $rowA['suggested_purchase_qty'])->toBe(70); // 90 - 20
});

it('a product with zero sales history at the shop is included with zero values', function () {
    $f = purchaseForecastFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson("/api/v1/purchases/forecast?location_id={$f['shopId']}&months=6")->assertOk();
    $rowB = collect($response->json('data'))->firstWhere('product_id', $f['prodB']);

    expect($rowB)->not->toBeNull();
    expect((float) $rowB['avg_daily_sales'])->toBe(0.0);
    expect((int) $rowB['projected_need'])->toBe(0);
    expect((int) $rowB['suggested_purchase_qty'])->toBe(0);
    expect((int) $rowB['current_stock'])->toBe(5);
});

it('suggested_purchase_qty never goes negative when stock exceeds projected need', function () {
    $f = purchaseForecastFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson("/api/v1/purchases/forecast?location_id={$f['shopId']}&months=2")->assertOk();
    $rowC = collect($response->json('data'))->firstWhere('product_id', $f['prodC']);

    expect((int) $rowC['current_stock'])->toBe(500);
    expect((int) $rowC['suggested_purchase_qty'])->toBe(0);
});

it('store_keeper can access the forecast endpoint', function () {
    $f = purchaseForecastFixtures();
    Sanctum::actingAs($f['storeKeeper']);

    $this->getJson("/api/v1/purchases/forecast?location_id={$f['shopId']}&months=2")->assertOk();
});

it('seller cannot access the forecast endpoint', function () {
    $f = purchaseForecastFixtures();
    Sanctum::actingAs($f['seller']);

    $this->getJson("/api/v1/purchases/forecast?location_id={$f['shopId']}&months=2")->assertForbidden();
});

it('months outside 2-12 is rejected', function () {
    $f = purchaseForecastFixtures();
    Sanctum::actingAs($f['admin']);

    $this->getJson("/api/v1/purchases/forecast?location_id={$f['shopId']}&months=1")->assertStatus(422);
    $this->getJson("/api/v1/purchases/forecast?location_id={$f['shopId']}&months=13")->assertStatus(422);
});

it('blends the 90-day average with the same-calendar-month average from last year', function () {
    $f = purchaseForecastFixtures();
    Sanctum::actingAs($f['admin']);
    $catId = DB::table('products')->where('id', $f['prodA'])->value('category_id');

    // Product D: 45 units sold today (within the 90-day window) -> 90-day avg = 45/90 = 0.5/day
    $prodD = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'PFProductD', 'wholesale_price' => 700, 'retail_price' => 1000, 'created_at' => now(), 'updated_at' => now()]);
    $saleToday = DB::table('sales')->insertGetId(['location_id' => $f['shopId'], 'sold_by' => $f['seller']->id, 'payment_method' => 'cash', 'total_amount' => 45000, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleToday, 'product_id' => $prodD, 'quantity' => 45, 'unit_price' => 1000, 'unit_cost' => 700, 'price_tier' => 'retail', 'created_at' => now()]);

    // Same calendar month, one year ago: target avg_daily = 2.0/day (quantity chosen so the average is exact)
    $lastYearMonthStart = today()->startOfMonth()->subYear();
    $daysInMonth = $lastYearMonthStart->daysInMonth;
    $lastYearQty = (int) (2.0 * $daysInMonth);
    $saleLastYear = DB::table('sales')->insertGetId(['location_id' => $f['shopId'], 'sold_by' => $f['seller']->id, 'payment_method' => 'cash', 'total_amount' => $lastYearQty * 1000, 'discount_amount' => 0, 'sale_date' => $lastYearMonthStart->copy()->addDays(min(14, $daysInMonth - 1)), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleLastYear, 'product_id' => $prodD, 'quantity' => $lastYearQty, 'unit_price' => 1000, 'unit_cost' => 700, 'price_tier' => 'retail', 'created_at' => now()]);

    $response = $this->getJson("/api/v1/purchases/forecast?location_id={$f['shopId']}&months=2")->assertOk();
    $rowD = collect($response->json('data'))->firstWhere('product_id', $prodD);

    expect((float) $rowD['avg_daily_sales'])->toBe(1.25); // (0.5 + 2.0) / 2
    expect((int) $rowD['current_stock'])->toBe(0);
    expect((int) $rowD['projected_need'])->toBe(75); // 1.25 * 30 * 2
    expect((int) $rowD['suggested_purchase_qty'])->toBe(75); // 75 - 0 stock
});

it('falls back to the 90-day average alone when there is no last-year data for that month', function () {
    // Product A already only has sales from "today" (no last-year sales) — this is the existing
    // fixture, re-asserted to prove the blended calculation doesn't regress the no-history case.
    $f = purchaseForecastFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson("/api/v1/purchases/forecast?location_id={$f['shopId']}&months=3")->assertOk();
    $rowA = collect($response->json('data'))->firstWhere('product_id', $f['prodA']);

    expect((float) $rowA['avg_daily_sales'])->toBe(1.0); // unchanged: 90-day avg alone, no last-year signal to blend
});
