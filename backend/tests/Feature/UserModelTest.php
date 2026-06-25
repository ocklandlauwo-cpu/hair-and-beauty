<?php

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

it('stores role, location_id, and is_active on users', function () {
    $user = User::factory()->create([
        'role' => 'admin',
        'location_id' => null,
        'is_active' => true,
    ]);

    expect($user->fresh())
        ->role->toBe('admin')
        ->location_id->toBeNull()
        ->is_active->toBeTrue();
});

it('can create a sanctum bearer token', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test');

    expect($token->plainTextToken)->toBeString()->not->toBeEmpty();
    expect(PersonalAccessToken::count())->toBe(1);
});
