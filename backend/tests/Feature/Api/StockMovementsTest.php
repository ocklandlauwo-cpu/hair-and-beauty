<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function stockMovementFixtures(): array
{
    $shopId = DB::table('locations')->insertGetId(['name' => 'SMShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shop2Id = DB::table('locations')->insertGetId(['name' => 'SMShop2'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId  = DB::table('categories')->insertGetId(['name' => 'SMCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'SMProduct', 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
    $admin  = User::factory()->admin()->create();
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);

    // 10 movements, each 1 second apart so created_at ordering is deterministic
    for ($i = 0; $i < 10; $i++) {
        DB::table('stock_movements')->insert([
            'product_id' => $prodId, 'location_id' => $shopId, 'movement_type' => 'adjustment',
            'quantity' => 1, 'reference_type' => 'test', 'reference_id' => $i, 'unit_cost' => 0,
            'performed_by' => $admin->id, 'created_at' => now()->subSeconds(10 - $i),
        ]);
    }

    return compact('shopId', 'shop2Id', 'prodId', 'admin', 'seller');
}

it('the preview endpoint returns at most 7 movements ordered descending', function () {
    $f = stockMovementFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson("/api/v1/stock/movements?product_id={$f['prodId']}&location_id={$f['shopId']}")
        ->assertOk();

    $rows = $response->json('data');
    expect(count($rows))->toBe(7);

    $dates = collect($rows)->pluck('created_at')->map(fn ($d) => strtotime($d));
    expect($dates->values()->all())->toBe($dates->sort()->reverse()->values()->all());
});

it('the full-history endpoint paginates all movements with product and location names', function () {
    $f = stockMovementFixtures();
    Sanctum::actingAs($f['admin']);

    $page1 = $this->getJson("/api/v1/stock/movements/history?product_id={$f['prodId']}&location_id={$f['shopId']}&per_page=6")
        ->assertOk()
        ->assertJsonStructure(['data', 'meta' => ['current_page', 'last_page', 'per_page', 'total', 'product_name', 'location_name']]);

    expect($page1->json('meta.total'))->toBe(10);
    expect($page1->json('meta.last_page'))->toBe(2);
    expect(count($page1->json('data')))->toBe(6);
    expect($page1->json('meta.product_name'))->toBe('SMProduct');

    $page2 = $this->getJson("/api/v1/stock/movements/history?product_id={$f['prodId']}&location_id={$f['shopId']}&per_page=6&page=2")
        ->assertOk();

    expect(count($page2->json('data')))->toBe(4);
});

it('seller cannot see another shop movement history via the full-history endpoint', function () {
    $f = stockMovementFixtures();
    Sanctum::actingAs($f['seller']); // seller's location is shopId, querying shop2Id
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    $locationIdsJson = json_encode([$f['shopId']]);
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $response = $this->getJson("/api/v1/stock/movements/history?product_id={$f['prodId']}&location_id={$f['shop2Id']}")
            ->assertOk();

        expect($response->json('meta.total'))->toBe(0);
        expect($response->json('data'))->toBe([]);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});
