<?php

use Database\Seeders\UatSeeder;

it('UatSeeder creates required business data', function () {
    $this->seed(UatSeeder::class);

    expect(\Illuminate\Support\Facades\DB::table('products')->count())->toBe(200);
    expect(\Illuminate\Support\Facades\DB::table('users')->where('role', 'seller')->count())->toBe(3);
    expect(\Illuminate\Support\Facades\DB::table('users')->where('role', 'store_keeper')->count())->toBeGreaterThanOrEqual(1);
    expect(\Illuminate\Support\Facades\DB::table('sales')->count())->toBeGreaterThan(50);
    expect(\Illuminate\Support\Facades\DB::table('stock_movements')->count())->toBeGreaterThan(100);
});
