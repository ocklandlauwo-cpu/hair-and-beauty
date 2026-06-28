<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can list users', function () {
    User::factory()->count(3)->create();
    Sanctum::actingAs(User::factory()->admin()->create());
    $this->getJson('/api/v1/users')->assertOk()->assertJsonStructure(['data', 'meta']);
});

it('admin can create a seller user', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'UMShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/users', [
        'name'        => 'Jane Seller',
        'email'       => 'jane.seller.'.uniqid().'@example.com',
        'password'    => 'password123',
        'role'        => 'seller',
        'location_id' => $shopId,
    ])
        ->assertCreated()
        ->assertJsonPath('data.role', 'seller');
});

it('non-admin cannot access user management', function () {
    Sanctum::actingAs(User::factory()->storeKeeper()->create());
    $this->getJson('/api/v1/users')->assertForbidden();
});

it('admin can toggle user active status', function () {
    $target = User::factory()->seller()->create(['is_active' => true]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->putJson("/api/v1/users/{$target->id}", ['is_active' => false])
        ->assertOk()
        ->assertJsonPath('data.is_active', false);
});
