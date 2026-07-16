<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function askedProductFixtures(): array
{
    $shop1Id = DB::table('locations')->insertGetId(['name' => 'APShop1'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shop2Id = DB::table('locations')->insertGetId(['name' => 'APShop2'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin   = User::factory()->admin()->create();
    $seller  = User::factory()->seller()->create(['location_id' => $shop1Id]);

    return compact('shop1Id', 'shop2Id', 'admin', 'seller');
}

it('any authenticated role can list asked products', function () {
    Sanctum::actingAs(User::factory()->seller()->create());
    $this->getJson('/api/v1/asked-products')->assertOk()->assertJsonStructure(['data', 'meta']);
});

it('seller creating an ask is always scoped to their own shop', function () {
    $f = askedProductFixtures();
    Sanctum::actingAs($f['seller']);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    $locationIdsJson = json_encode([$f['shop1Id']]);
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $response = $this->postJson('/api/v1/asked-products', [
            'product_name' => 'Argan Oil Shampoo',
            'location_id'  => $f['shop2Id'], // attempt to spoof a different shop — must be ignored
        ]);

        $response->assertCreated()->assertJsonPath('data.location_id', $f['shop1Id']);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('admin can create an ask for any shop', function () {
    $f = askedProductFixtures();
    Sanctum::actingAs($f['admin']);

    $this->postJson('/api/v1/asked-products', [
        'product_name' => 'Keratin Treatment',
        'location_id'  => $f['shop2Id'],
    ])->assertCreated()->assertJsonPath('data.location_id', $f['shop2Id']);
});

it('creating a duplicate name at the same shop increments the existing row', function () {
    $f = askedProductFixtures();
    Sanctum::actingAs($f['admin']);

    $this->postJson('/api/v1/asked-products', [
        'product_name' => 'Coconut Hair Oil',
        'location_id'  => $f['shop1Id'],
    ])->assertCreated();

    $response = $this->postJson('/api/v1/asked-products', [
        'product_name' => '  coconut hair oil  ', // different case + surrounding whitespace
        'location_id'  => $f['shop1Id'],
    ]);

    $response->assertOk()->assertJsonPath('data.times_asked', 2);

    expect(DB::table('asked_products')->where('location_id', $f['shop1Id'])->where('product_name', 'Coconut Hair Oil')->count())->toBe(1);
});

it('the same name at a different shop creates a separate row', function () {
    $f = askedProductFixtures();
    Sanctum::actingAs($f['admin']);

    $this->postJson('/api/v1/asked-products', ['product_name' => 'Hair Serum', 'location_id' => $f['shop1Id']])->assertCreated();
    $this->postJson('/api/v1/asked-products', ['product_name' => 'Hair Serum', 'location_id' => $f['shop2Id']])->assertCreated();

    expect(DB::table('asked_products')->where('product_name', 'Hair Serum')->count())->toBe(2);
});

it('the increment endpoint bumps times_asked and updates updated_at', function () {
    $f = askedProductFixtures();
    Sanctum::actingAs($f['admin']);

    $createRes = $this->postJson('/api/v1/asked-products', ['product_name' => 'Curl Cream', 'location_id' => $f['shop1Id']])->assertCreated();
    $id = $createRes->json('data.id');
    $originalUpdatedAt = DB::table('asked_products')->where('id', $id)->value('updated_at');

    sleep(1);

    $this->postJson("/api/v1/asked-products/{$id}/increment")
        ->assertOk()
        ->assertJsonPath('data.times_asked', 2);

    $newUpdatedAt = DB::table('asked_products')->where('id', $id)->value('updated_at');
    expect((string) $newUpdatedAt)->not->toBe((string) $originalUpdatedAt);
});

it('seller cannot increment or view an ask belonging to another shop', function () {
    $f = askedProductFixtures();
    Sanctum::actingAs($f['admin']);
    $createRes = $this->postJson('/api/v1/asked-products', ['product_name' => 'Leave-In Conditioner', 'location_id' => $f['shop2Id']])->assertCreated();
    $id = $createRes->json('data.id');

    Sanctum::actingAs($f['seller']); // seller's location is shop1Id, not shop2Id
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    $locationIdsJson = json_encode([$f['shop1Id']]);
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        // RLS hides the row entirely (different shop), so route-model binding
        // fails before the policy check ever runs — 404, not 403.
        $this->postJson("/api/v1/asked-products/{$id}/increment")->assertNotFound();

        $listResponse = $this->getJson('/api/v1/asked-products')->assertOk();
        expect(collect($listResponse->json('data'))->pluck('id'))->not->toContain($id);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('only admin can delete an asked product', function () {
    $f = askedProductFixtures();
    Sanctum::actingAs($f['admin']);
    $createRes = $this->postJson('/api/v1/asked-products', ['product_name' => 'Deep Conditioner', 'location_id' => $f['shop1Id']])->assertCreated();
    $id = $createRes->json('data.id');

    Sanctum::actingAs($f['seller']);
    $this->deleteJson("/api/v1/asked-products/{$id}")->assertForbidden();

    Sanctum::actingAs($f['admin']);
    $this->deleteJson("/api/v1/asked-products/{$id}")->assertOk();
});
