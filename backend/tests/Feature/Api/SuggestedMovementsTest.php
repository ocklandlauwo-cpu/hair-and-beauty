<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function smShop(string $label): int
{
    return DB::table('locations')->insertGetId([
        'name' => $label.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100,
        'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
    ]);
}

function smProduct(int $catId, string $label): int
{
    return DB::table('products')->insertGetId([
        'category_id' => $catId, 'name' => $label.uniqid(),
        'wholesale_price' => 1000, 'retail_price' => 1500, 'created_at' => now(), 'updated_at' => now(),
    ]);
}

function smSell(int $shopId, int $prodId, int $qty, int $sellerId): void
{
    $saleId = DB::table('sales')->insertGetId([
        'location_id' => $shopId, 'sold_by' => $sellerId, 'payment_method' => 'cash',
        'total_amount' => $qty * 1500, 'discount_amount' => 0, 'sale_date' => today(),
        'created_at' => now(), 'updated_at' => now(),
    ]);
    DB::table('sale_items')->insert([
        'sale_id' => $saleId, 'product_id' => $prodId, 'quantity' => $qty,
        'unit_price' => 1500, 'unit_cost' => 1000, 'price_tier' => 'retail', 'created_at' => now(),
    ]);
}

function smStock(int $shopId, int $prodId, int $qty, int $performedBy): void
{
    DB::table('stock_movements')->insert([
        'product_id' => $prodId, 'location_id' => $shopId, 'movement_type' => 'distribution_in',
        'quantity' => $qty, 'reference_type' => 'test', 'reference_id' => 1,
        'unit_cost' => 1000, 'performed_by' => $performedBy, 'created_at' => now(),
    ]);
}

function smBase(): array
{
    $catId = DB::table('categories')->insertGetId(['name' => 'SMCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $admin = User::factory()->admin()->create();
    $storeKeeper = User::factory()->storeKeeper()->create();
    $seller = User::factory()->seller()->create();

    return compact('catId', 'admin', 'storeKeeper', 'seller');
}

it('pairs the biggest-surplus shop with the most-urgent-deficit shop and computes suggested_qty', function () {
    $b = smBase();
    $prod = smProduct($b['catId'], 'SMProdA');
    $shopSurplus = smShop('SMShopSurplusA');
    $shopDeficit = smShop('SMShopDeficitA');

    // Surplus shop: sold 9 units in 90 days (avg_daily 0.1), 100 in stock -> days_of_cover 1000
    smSell($shopSurplus, $prod, 9, $b['seller']->id);
    smStock($shopSurplus, $prod, 100, $b['admin']->id);

    // Deficit shop: sold 90 units in 90 days (avg_daily 1.0), 0 in stock -> days_of_cover 0
    smSell($shopDeficit, $prod, 90, $b['seller']->id);

    Sanctum::actingAs($b['admin']);
    $response = $this->getJson('/api/v1/distributions/suggested-movements')
        ->assertOk()
        ->assertJsonStructure(['data' => [['product_id', 'product_name', 'category_name',
            'from_location_id', 'from_location_name', 'from_days_of_cover',
            'to_location_id', 'to_location_name', 'to_days_of_cover', 'suggested_qty']]]);

    $row = collect($response->json('data'))->firstWhere('product_id', $prod);

    expect($row)->not->toBeNull();
    expect($row['from_location_id'])->toBe($shopSurplus);
    expect($row['to_location_id'])->toBe($shopDeficit);
    expect($row['from_days_of_cover'])->toBe(1000);
    expect($row['to_days_of_cover'])->toBe(0);
    // target_source = 0.1*30=3, excess_source = 100-3=97; target_dest = 1.0*30=30, shortfall_dest = 30-0=30
    expect($row['suggested_qty'])->toBe(30);
});

it('produces no suggestion when all shops are balanced (0.5-2 months of cover)', function () {
    $b = smBase();
    $prod = smProduct($b['catId'], 'SMProdBalanced');
    $shopA = smShop('SMShopBalA');
    $shopB = smShop('SMShopBalB');

    // Both shops: avg_daily 1.0, stock 30 -> days_of_cover 30 (between 15 and 60, i.e. 0.5-2 months)
    smSell($shopA, $prod, 90, $b['seller']->id);
    smStock($shopA, $prod, 30, $b['admin']->id);
    smSell($shopB, $prod, 90, $b['seller']->id);
    smStock($shopB, $prod, 30, $b['admin']->id);

    Sanctum::actingAs($b['admin']);
    $response = $this->getJson('/api/v1/distributions/suggested-movements')->assertOk();

    expect(collect($response->json('data'))->firstWhere('product_id', $prod))->toBeNull();
});

it('produces no suggestion when a surplus shop has no deficit shop anywhere', function () {
    $b = smBase();
    $prod = smProduct($b['catId'], 'SMProdNoDeficit');
    $shopSurplus = smShop('SMShopOnlySurplus');

    smSell($shopSurplus, $prod, 9, $b['seller']->id);
    smStock($shopSurplus, $prod, 100, $b['admin']->id);

    Sanctum::actingAs($b['admin']);
    $response = $this->getJson('/api/v1/distributions/suggested-movements')->assertOk();

    expect(collect($response->json('data'))->firstWhere('product_id', $prod))->toBeNull();
});

it('produces no suggestion for a product with zero sales at every shop', function () {
    $b = smBase();
    $prod = smProduct($b['catId'], 'SMProdNoDemand');
    $shop = smShop('SMShopNoDemand');

    // Stock but never sold anywhere
    smStock($shop, $prod, 50, $b['admin']->id);

    Sanctum::actingAs($b['admin']);
    $response = $this->getJson('/api/v1/distributions/suggested-movements')->assertOk();

    expect(collect($response->json('data'))->firstWhere('product_id', $prod))->toBeNull();
});

it('picks only the single biggest-surplus shop as source when two shops are surplus', function () {
    $b = smBase();
    $prod = smProduct($b['catId'], 'SMProdTwoSurplus');
    $shopBigSurplus = smShop('SMShopBigSurplus');
    $shopSmallSurplus = smShop('SMShopSmallSurplus');
    $shopDeficit = smShop('SMShopDeficitB');

    // Bigger surplus: avg_daily 0.1 (sold 9), stock 100 -> days_of_cover 1000
    smSell($shopBigSurplus, $prod, 9, $b['seller']->id);
    smStock($shopBigSurplus, $prod, 100, $b['admin']->id);

    // Smaller surplus: avg_daily 0.2 (sold 18), stock 100 -> days_of_cover 500
    smSell($shopSmallSurplus, $prod, 18, $b['seller']->id);
    smStock($shopSmallSurplus, $prod, 100, $b['admin']->id);

    // Deficit shop
    smSell($shopDeficit, $prod, 90, $b['seller']->id);

    Sanctum::actingAs($b['admin']);
    $response = $this->getJson('/api/v1/distributions/suggested-movements')->assertOk();
    $row = collect($response->json('data'))->firstWhere('product_id', $prod);

    expect($row)->not->toBeNull();
    expect($row['from_location_id'])->toBe($shopBigSurplus);
});

it('seller cannot access the suggested movements endpoint', function () {
    $b = smBase();
    Sanctum::actingAs($b['seller']);

    $this->getJson('/api/v1/distributions/suggested-movements')->assertForbidden();
});
