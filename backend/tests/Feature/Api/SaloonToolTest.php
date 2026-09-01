<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can log a tool purchase and it appears in the list with the correct total', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'STShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/saloon-tools', [
        'location_id'    => $shopId,
        'name'           => 'Hair Dryer',
        'quantity'       => 3,
        'unit_cost'      => 50000,
        'purchase_date'  => today()->toDateString(),
    ])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Hair Dryer')
        ->assertJsonPath('data.quantity', 3)
        ->assertJsonPath('data.total', 150000.0);

    $this->getJson('/api/v1/saloon-tools')
        ->assertOk()
        ->assertJsonStructure(['data' => [['id', 'purchase_date', 'location_name', 'name', 'quantity', 'unit_cost', 'total']], 'meta'])
        ->assertJsonFragment(['name' => 'Hair Dryer']);
});

it('seller cannot list or log a tool purchase', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'STShop2'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->seller()->create(['location_id' => $shopId]));

    $this->getJson('/api/v1/saloon-tools')->assertForbidden();
    $this->postJson('/api/v1/saloon-tools', [
        'location_id' => $shopId, 'name' => 'X', 'quantity' => 1, 'unit_cost' => 100, 'purchase_date' => today()->toDateString(),
    ])->assertForbidden();
});

it('store_keeper cannot list or log a tool purchase', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'STShop4'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->storeKeeper()->create());
    $this->getJson('/api/v1/saloon-tools')->assertForbidden();
    $this->postJson('/api/v1/saloon-tools', [
        'location_id' => $shopId, 'name' => 'X', 'quantity' => 1, 'unit_cost' => 100, 'purchase_date' => today()->toDateString(),
    ])->assertForbidden();
});

it('quantity must be at least 1 and unit_cost cannot be negative', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'STShop3'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/saloon-tools', ['location_id' => $shopId, 'name' => 'X', 'quantity' => 0, 'unit_cost' => 100, 'purchase_date' => today()->toDateString()])
        ->assertStatus(422);
    $this->postJson('/api/v1/saloon-tools', ['location_id' => $shopId, 'name' => 'X', 'quantity' => 1, 'unit_cost' => -5, 'purchase_date' => today()->toDateString()])
        ->assertStatus(422);
});
