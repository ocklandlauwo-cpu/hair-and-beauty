<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

it('locations table has required columns', function () {
    expect(Schema::hasTable('locations'))->toBeTrue();
    foreach (['id', 'name', 'type', 'geofence_lat', 'geofence_lng',
              'geofence_radius_m', 'is_active', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('locations', $col))->toBeTrue();
    }
});

it('categories table has required columns', function () {
    expect(Schema::hasTable('categories'))->toBeTrue();
    foreach (['id', 'name', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('categories', $col))->toBeTrue();
    }
});

it('users table has location_id foreign key', function () {
    $fks = DB::select("
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'users'
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%location_id%'
    ");
    expect($fks)->not->toBeEmpty();
});

it('LocationSeeder inserts 1 store and 3 shops', function () {
    DB::table('locations')->delete();
    $this->seed(\Database\Seeders\LocationSeeder::class);
    expect(DB::table('locations')->where('type', 'store')->count())->toBe(1);
    expect(DB::table('locations')->where('type', 'shop')->count())->toBe(3);
});

it('CategorySeeder inserts Hair and Cosmetics', function () {
    DB::table('categories')->delete();
    $this->seed(\Database\Seeders\CategorySeeder::class);
    $names = DB::table('categories')->pluck('name')->sort()->values()->all();
    expect($names)->toBe(['Cosmetics', 'Hair']);
});
