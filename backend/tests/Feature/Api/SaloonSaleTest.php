<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function saloonSaleFixtures(): array
{
    $shopAName = 'SSShopA'.uniqid();
    $shopBName = 'SSShopB'.uniqid();
    $shopA = DB::table('locations')->insertGetId(['name' => $shopAName, 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shopB = DB::table('locations')->insertGetId(['name' => $shopBName, 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = User::factory()->admin()->create();
    $storeKeeper = User::factory()->storeKeeper()->create();
    $sellerA = User::factory()->seller()->create(['location_id' => $shopA]);

    DB::statement("SELECT set_config('app.role', 'admin', false)");
    $providerId = DB::table('providers')->insertGetId(['name' => 'SSProvider', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'Kuosha', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    return compact('shopA', 'shopB', 'shopAName', 'shopBName', 'admin', 'storeKeeper', 'sellerA', 'providerId', 'serviceId');
}

it('seller can log a saloon sale, auto-scoped to their own shop', function () {
    $f = saloonSaleFixtures();
    Sanctum::actingAs($f['sellerA']);
    $locationIdsJson = json_encode([$f['shopA']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->postJson('/api/v1/saloon-sales', [
            'location_id'       => $f['shopB'], // seller cannot override — ignored
            'provider_id'       => $f['providerId'],
            'saloon_service_id' => $f['serviceId'],
            'amount'            => 15000,
            'sale_date'         => today()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('data.location_name', $f['shopAName'])
            ->assertJsonPath('data.amount', '15000.00');
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('admin can log a saloon sale for any shop', function () {
    $f = saloonSaleFixtures();
    Sanctum::actingAs($f['admin']);

    $this->postJson('/api/v1/saloon-sales', [
        'location_id'       => $f['shopB'],
        'provider_id'       => $f['providerId'],
        'saloon_service_id' => $f['serviceId'],
        'amount'            => 20000,
        'sale_date'         => today()->toDateString(),
    ])
        ->assertCreated()
        ->assertJsonPath('data.location_name', $f['shopBName']);
});

it('store_keeper cannot log a saloon sale', function () {
    $f = saloonSaleFixtures();
    Sanctum::actingAs($f['storeKeeper']);

    $this->postJson('/api/v1/saloon-sales', [
        'location_id'       => $f['shopA'],
        'provider_id'       => $f['providerId'],
        'saloon_service_id' => $f['serviceId'],
        'amount'            => 1000,
        'sale_date'         => today()->toDateString(),
    ])->assertForbidden();
});

it('index filters by date range and shop, and a seller only sees their own shop', function () {
    $f = saloonSaleFixtures();
    Sanctum::actingAs($f['admin']);

    $this->postJson('/api/v1/saloon-sales', ['location_id' => $f['shopA'], 'provider_id' => $f['providerId'], 'saloon_service_id' => $f['serviceId'], 'amount' => 1000, 'sale_date' => today()->toDateString()])->assertCreated();
    $this->postJson('/api/v1/saloon-sales', ['location_id' => $f['shopB'], 'provider_id' => $f['providerId'], 'saloon_service_id' => $f['serviceId'], 'amount' => 2000, 'sale_date' => today()->toDateString()])->assertCreated();
    $this->postJson('/api/v1/saloon-sales', ['location_id' => $f['shopA'], 'provider_id' => $f['providerId'], 'saloon_service_id' => $f['serviceId'], 'amount' => 3000, 'sale_date' => today()->subDays(60)->toDateString()])->assertCreated();

    $res = $this->getJson('/api/v1/saloon-sales?location_id='.$f['shopA'].'&date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk()
        ->assertJsonStructure(['data' => [['id', 'sale_date', 'provider_name', 'service_name', 'amount', 'location_name']], 'meta']);

    $amounts = collect($res->json('data'))->pluck('amount');
    expect($amounts)->toHaveCount(1);
    expect($amounts->first())->toBe('1000.00');
});

it('records the product and quantity for a service that uses products, without touching stock', function () {
    $f = saloonSaleFixtures();
    DB::statement("SELECT set_config('app.role', 'admin', false)");
    $braidId = DB::table('saloon_services')->insertGetId(['name' => 'KUSUKA NYWELE', 'uses_product' => true, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId  = DB::table('categories')->insertGetId(['name' => 'SSC'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodName = 'Braid Pack'.uniqid();
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => $prodName, 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');
    $movementsBefore = DB::table('stock_movements')->where('product_id', $prodId)->count();

    Sanctum::actingAs($f['admin']);
    $this->postJson('/api/v1/saloon-sales', [
        'location_id' => $f['shopA'], 'provider_id' => $f['providerId'], 'saloon_service_id' => $braidId,
        'product_id' => $prodId, 'product_quantity' => 3, 'amount' => 20000, 'sale_date' => today()->toDateString(),
    ])
        ->assertCreated()
        ->assertJsonPath('data.product_quantity', 3)
        ->assertJsonPath('data.product_name', $prodName);

    expect(DB::table('stock_movements')->where('product_id', $prodId)->count())->toBe($movementsBefore);
});

it('product is optional and is ignored for services that do not use products', function () {
    $f = saloonSaleFixtures();
    DB::statement("SELECT set_config('app.role', 'admin', false)");
    $catId  = DB::table('categories')->insertGetId(['name' => 'SSC'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'SSP'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');
    Sanctum::actingAs($f['admin']);

    // Kuosha (uses_product = false): product fields are dropped
    $this->postJson('/api/v1/saloon-sales', [
        'location_id' => $f['shopA'], 'provider_id' => $f['providerId'], 'saloon_service_id' => $f['serviceId'],
        'product_id' => $prodId, 'product_quantity' => 2, 'amount' => 5000, 'sale_date' => today()->toDateString(),
    ])->assertCreated()->assertJsonPath('data.product_name', null)->assertJsonPath('data.product_quantity', null);

    // Product chosen without a quantity is rejected
    $this->postJson('/api/v1/saloon-sales', [
        'location_id' => $f['shopA'], 'provider_id' => $f['providerId'], 'saloon_service_id' => $f['serviceId'],
        'product_id' => $prodId, 'amount' => 6000, 'sale_date' => today()->toDateString(),
    ])->assertUnprocessable()->assertJsonValidationErrors('product_quantity');
});
