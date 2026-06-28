<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function distFixtures(): array
{
    $storeId = DB::table('locations')->insertGetId(['name' => 'Store'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shopId  = DB::table('locations')->insertGetId(['name' => 'Shop'.uniqid(),  'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId   = DB::table('categories')->insertGetId(['name' => 'DC'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId  = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'DP'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
    $sk      = User::factory()->storeKeeper()->create(['location_id' => $storeId]);
    $seller  = User::factory()->seller()->create(['location_id' => $shopId]);

    // Add stock at store
    DB::table('stock_movements')->insert(['product_id' => $prodId, 'location_id' => $storeId, 'movement_type' => 'purchase', 'quantity' => 50, 'reference_type' => 'purchase', 'reference_id' => 1, 'unit_cost' => 80, 'performed_by' => $sk->id, 'created_at' => now()]);

    return compact('storeId', 'shopId', 'catId', 'prodId', 'sk', 'seller');
}

it('store_keeper can create a distribution (status=pending, stock_out movement created)', function () {
    $f = distFixtures();
    Sanctum::actingAs($f['sk']);

    $response = $this->postJson('/api/v1/distributions', [
        'to_location_id'  => $f['shopId'],
        'distributed_at'  => now()->toIso8601String(),
        'items' => [
            ['product_id' => $f['prodId'], 'quantity_sent' => 10],
        ],
    ]);

    $response->assertCreated()->assertJsonPath('data.status', 'pending');

    $outMovement = DB::table('stock_movements')
        ->where('product_id', $f['prodId'])
        ->where('movement_type', 'distribution_out')
        ->first();

    expect($outMovement)->not->toBeNull();
    expect((int) $outMovement->quantity)->toBe(-10);
});

it('seller cannot create a distribution', function () {
    $f = distFixtures();
    Sanctum::actingAs($f['seller']);

    $this->postJson('/api/v1/distributions', [
        'to_location_id' => $f['shopId'],
        'distributed_at' => now()->toIso8601String(),
        'items' => [['product_id' => $f['prodId'], 'quantity_sent' => 5]],
    ])->assertForbidden();
});

it('seller can confirm a distribution (stock_in movement created)', function () {
    $f = distFixtures();

    // Create a pending distribution as store_keeper
    Sanctum::actingAs($f['sk']);
    $distRes = $this->postJson('/api/v1/distributions', [
        'to_location_id' => $f['shopId'],
        'distributed_at' => now()->toIso8601String(),
        'items' => [['product_id' => $f['prodId'], 'quantity_sent' => 10]],
    ]);
    $distId = $distRes->json('data.id');

    // Confirm as seller
    Sanctum::actingAs($f['seller']);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    $locationIdsJson = json_encode([$f['shopId']]);
    DB::statement("SELECT set_config('app.location_ids', '$locationIdsJson', false)");

    try {
        $this->postJson("/api/v1/distributions/{$distId}/confirm", [
            'items' => [
                ['distribution_item_id' => DB::table('distribution_items')->where('distribution_id', $distId)->value('id'), 'quantity_received' => 10],
            ],
        ])->assertOk()->assertJsonPath('data.status', 'confirmed');

        $inMovement = DB::table('stock_movements')
            ->where('product_id', $f['prodId'])
            ->where('movement_type', 'distribution_in')
            ->first();

        expect($inMovement)->not->toBeNull();
        expect((int) $inMovement->quantity)->toBe(10);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('any authenticated role can list distributions', function () {
    Sanctum::actingAs(User::factory()->seller()->create());
    $this->getJson('/api/v1/distributions')->assertOk()->assertJsonStructure(['data']);
});
