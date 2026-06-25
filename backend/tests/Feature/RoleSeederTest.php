<?php

use Database\Seeders\RoleSeeder;
use Spatie\Permission\Models\Role;

it('seeds the three application roles with sanctum guard', function () {
    $this->seed(RoleSeeder::class);

    expect(Role::where('guard_name', 'sanctum')->pluck('name')->sort()->values()->all())
        ->toBe(['admin', 'seller', 'store_keeper']);
});

it('is idempotent — seeding twice does not duplicate roles', function () {
    $this->seed(RoleSeeder::class);
    $this->seed(RoleSeeder::class);

    expect(Role::where('guard_name', 'sanctum')->count())->toBe(3);
});
