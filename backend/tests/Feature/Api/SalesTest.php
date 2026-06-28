<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function salesFixtures(): array
{
    $shopId  = DB::table('locations')->insertGetId(['name' => 'Shop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId   = DB::table('categories')->insertGetId(['name' => 'SC'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId  = DB::table('products')->insertGetId([
        'category_id' => $catId, 'name' => 'SP'.uniqid(),
        'wholesale_price' => 8000, 'retail_price' => 12000,
        'wholesale_threshold' => 12, 'latest_cost' => 6000,
        'created_at' => now(), 'updated_at' => now(),
    ]);
    $seller  = User::factory()->seller()->create(['location_id' => $shopId]);
    $admin   = User::factory()->admin()->create();

    // Give shop some stock
    DB::table('stock_movements')->insert(['product_id' => $prodId, 'location_id' => $shopId, 'movement_type' => 'distribution_in', 'quantity' => 50, 'reference_type' => 'distribution', 'reference_id' => 1, 'unit_cost' => 6000, 'performed_by' => $seller->id, 'created_at' => now()]);

    return compact('shopId', 'prodId', 'seller', 'admin');
}

it('seller can create a sale (retail tier — qty below threshold)', function () {
    $f = salesFixtures();
    Sanctum::actingAs($f['seller']);
    $locationIdsJson = json_encode([$f['shopId']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $response = $this->postJson('/api/v1/sales', [
            'payment_method' => 'nmb',
            'sale_date'      => today()->toDateString(),
            'items' => [
                ['product_id' => $f['prodId'], 'quantity' => 2],
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.total_amount', '24000.00'); // 2 × 12000 retail
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('sale at wholesale threshold uses wholesale price', function () {
    $f = salesFixtures();
    Sanctum::actingAs($f['seller']);
    $locationIdsJson = json_encode([$f['shopId']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $response = $this->postJson('/api/v1/sales', [
            'payment_method' => 'airtel',
            'sale_date'      => today()->toDateString(),
            'items' => [
                ['product_id' => $f['prodId'], 'quantity' => 12], // exactly threshold
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.total_amount', '96000.00'); // 12 × 8000 wholesale
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('sale creates a stock_out movement at seller location', function () {
    $f = salesFixtures();
    Sanctum::actingAs($f['seller']);
    $locationIdsJson = json_encode([$f['shopId']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->postJson('/api/v1/sales', [
            'payment_method' => 'tigo',
            'sale_date'      => today()->toDateString(),
            'items' => [['product_id' => $f['prodId'], 'quantity' => 3]],
        ])->assertCreated();

        $movement = DB::table('stock_movements')
            ->where('product_id', $f['prodId'])
            ->where('location_id', $f['shopId'])
            ->where('movement_type', 'sale')
            ->first();

        expect($movement)->not->toBeNull();
        expect((int) $movement->quantity)->toBe(-3);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('admin can revert a sale and stock is restored', function () {
    $f = salesFixtures();
    Sanctum::actingAs($f['seller']);
    $locationIdsJson = json_encode([$f['shopId']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    $saleRes = $this->postJson('/api/v1/sales', [
        'payment_method' => 'nmb',
        'sale_date'      => today()->toDateString(),
        'items'          => [['product_id' => $f['prodId'], 'quantity' => 5]],
    ]);
    $saleId = $saleRes->json('data.id');

    DB::unprepared('RESET app.role');
    DB::unprepared('RESET app.location_ids');

    Sanctum::actingAs($f['admin']);
    DB::statement("SELECT set_config('app.role', 'admin', false)");
    $this->postJson("/api/v1/sales/{$saleId}/revert", ['reason' => 'Customer returned goods'])
        ->assertOk()
        ->assertJsonPath('data.is_reverted', true);

    $revertMovement = DB::table('stock_movements')
        ->where('product_id', $f['prodId'])
        ->where('movement_type', 'sale_revert')
        ->first();
    expect($revertMovement)->not->toBeNull();
    expect((int) $revertMovement->quantity)->toBe(5);
});

it('seller cannot revert a sale', function () {
    $f = salesFixtures();
    $saleId = DB::table('sales')->insertGetId([
        'location_id' => $f['shopId'], 'sold_by' => $f['seller']->id,
        'payment_method' => 'nmb', 'total_amount' => 1000, 'sale_date' => today(),
        'created_at' => now(), 'updated_at' => now(),
    ]);
    Sanctum::actingAs($f['seller']);

    $this->postJson("/api/v1/sales/{$saleId}/revert", ['reason' => 'x'])
        ->assertForbidden();
});
