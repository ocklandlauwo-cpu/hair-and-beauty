<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function purchasingFixtures(): array
{
    $storeId = DB::table('locations')->insertGetId(['name' => 'CStore'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId   = DB::table('categories')->insertGetId(['name' => 'PurchCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId  = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'PurchProd'.uniqid(), 'wholesale_price' => 1000, 'retail_price' => 1500, 'created_at' => now(), 'updated_at' => now()]);
    $sk      = User::factory()->storeKeeper()->create(['location_id' => $storeId]);
    return compact('storeId', 'catId', 'prodId', 'sk');
}

it('store_keeper can record a purchase and stock movement is created', function () {
    $f = purchasingFixtures();
    Sanctum::actingAs($f['sk']);

    $response = $this->postJson('/api/v1/purchases', [
        'purchase_date' => today()->toDateString(),
        'supplier_name' => 'ABC Supplies',
        'items' => [
            ['product_id' => $f['prodId'], 'quantity' => 20, 'unit_cost' => 800],
        ],
    ]);

    $response->assertCreated()->assertJsonPath('data.supplier_name', 'ABC Supplies');

    // Verify stock movement created
    $movement = DB::table('stock_movements')
        ->where('product_id', $f['prodId'])
        ->where('location_id', $f['storeId'])
        ->where('movement_type', 'purchase')
        ->first();

    expect($movement)->not->toBeNull();
    expect((int) $movement->quantity)->toBe(20);
});

it('purchase triggers latest_cost update on product', function () {
    $f = purchasingFixtures();
    Sanctum::actingAs($f['sk']);

    $this->postJson('/api/v1/purchases', [
        'purchase_date' => today()->toDateString(),
        'items' => [
            ['product_id' => $f['prodId'], 'quantity' => 10, 'unit_cost' => 950.50],
        ],
    ])->assertCreated();

    $latestCost = DB::table('products')->where('id', $f['prodId'])->value('latest_cost');
    expect((float) $latestCost)->toBe(950.50);
});

it('seller cannot record a purchase', function () {
    $f = purchasingFixtures();
    Sanctum::actingAs(User::factory()->seller()->create(['location_id' => $f['storeId']]));

    $this->postJson('/api/v1/purchases', [
        'purchase_date' => today()->toDateString(),
        'items' => [['product_id' => $f['prodId'], 'quantity' => 5, 'unit_cost' => 100]],
    ])->assertForbidden();
});

it('authenticated user can view current stock', function () {
    Sanctum::actingAs(User::factory()->seller()->create());
    $this->getJson('/api/v1/stock')->assertOk()->assertJsonStructure(['data']);
});

it('authenticated user can view expiry alerts', function () {
    Sanctum::actingAs(User::factory()->admin()->create());
    $this->getJson('/api/v1/stock/alerts/expiry')->assertOk()->assertJsonStructure(['data']);
});

it('authenticated user can list locations', function () {
    Sanctum::actingAs(User::factory()->seller()->create());
    $this->getJson('/api/v1/locations')->assertOk()->assertJsonStructure(['data']);
});
