<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;

it('issues a bearer token on valid credentials', function () {
    User::factory()->create([
        'email'    => 'admin@example.com',
        'password' => Hash::make('password'),
        'role'     => 'admin',
        'is_active' => true,
    ]);

    $this->postJson('/api/v1/auth/login', [
        'email'    => 'admin@example.com',
        'password' => 'password',
    ])
        ->assertOk()
        ->assertJsonStructure([
            'data' => [
                'token',
                'user' => ['id', 'name', 'email', 'role', 'location_id', 'is_active'],
            ],
        ]);
});

it('returns 422 for invalid credentials', function () {
    User::factory()->create(['email' => 'user@example.com']);

    $this->postJson('/api/v1/auth/login', [
        'email'    => 'user@example.com',
        'password' => 'wrong',
    ])->assertUnprocessable();
});

it('returns 422 for inactive users', function () {
    User::factory()->inactive()->create([
        'email'    => 'inactive@example.com',
        'password' => Hash::make('password'),
    ]);

    $this->postJson('/api/v1/auth/login', [
        'email'    => 'inactive@example.com',
        'password' => 'password',
    ])->assertUnprocessable();
});

it('returns the authenticated user on GET /me', function () {
    $locationId = \Illuminate\Support\Facades\DB::table('locations')->insertGetId([
        'name' => 'Test Shop', 'type' => 'shop', 'geofence_radius_m' => 100,
        'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
    ]);
    $user = User::factory()->seller()->create(['location_id' => $locationId]);
    Sanctum::actingAs($user);

    $this->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('data.id', $user->id)
        ->assertJsonPath('data.role', 'seller')
        ->assertJsonPath('data.location_id', $locationId)
        ->assertJsonPath('data.is_active', true);
});

it('returns 401 for unauthenticated GET /me', function () {
    $this->getJson('/api/v1/auth/me')->assertUnauthorized();
});

it('revokes the current token on POST /logout', function () {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/auth/logout')->assertOk()
        ->assertJsonPath('message', 'Logged out successfully');

    expect($user->tokens()->count())->toBe(0);
});

it('returns 401 for unauthenticated POST /logout', function () {
    $this->postJson('/api/v1/auth/logout')->assertUnauthorized();
});
