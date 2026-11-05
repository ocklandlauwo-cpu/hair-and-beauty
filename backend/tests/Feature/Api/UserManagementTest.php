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
        'name' => 'Jane Seller',
        'email' => 'jane.seller.'.uniqid().'@example.com',
        'password' => 'password123',
        'role' => 'seller',
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

it('admin can update a user email', function () {
    $target = User::factory()->seller()->create(['email' => 'old@example.com']);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->putJson("/api/v1/users/{$target->id}", ['email' => 'new@example.com'])
        ->assertOk()
        ->assertJsonPath('data.email', 'new@example.com');
});

it('phone is optional on create and can be added, changed and cleared on edit', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $id = $this->postJson('/api/v1/users', [
        'name' => 'No Phone', 'email' => 'nophone.'.uniqid().'@example.com',
        'password' => 'password123', 'role' => 'store_keeper',
    ])->assertCreated()->assertJsonPath('data.phone', null)->json('data.id');

    $this->putJson("/api/v1/users/{$id}", ['phone' => '+255 712 345 678'])
        ->assertOk()->assertJsonPath('data.phone', '+255 712 345 678');

    $this->putJson("/api/v1/users/{$id}", ['phone' => ''])
        ->assertOk()->assertJsonPath('data.phone', null);
});

it('rejects an invalid phone number', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/users', [
        'name' => 'Bad Phone', 'email' => 'badphone.'.uniqid().'@example.com',
        'password' => 'password123', 'role' => 'store_keeper', 'phone' => 'call me',
    ])->assertUnprocessable()->assertJsonValidationErrors('phone');
});
