<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

it('providers table has all required columns', function () {
    expect(Schema::hasTable('providers'))->toBeTrue();
    foreach (['id', 'name', 'phone', 'is_active', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('providers', $col))->toBeTrue();
    }
});

it('saloon_services table has all required columns', function () {
    expect(Schema::hasTable('saloon_services'))->toBeTrue();
    foreach (['id', 'name', 'is_active', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('saloon_services', $col))->toBeTrue();
    }
});

it('saloon_sales table has all required columns', function () {
    expect(Schema::hasTable('saloon_sales'))->toBeTrue();
    foreach ([
        'id', 'location_id', 'provider_id', 'saloon_service_id',
        'amount', 'sale_date', 'created_by', 'created_at', 'updated_at',
    ] as $col) {
        expect(Schema::hasColumn('saloon_sales', $col))->toBeTrue();
    }
});

it('saloon_tools table has all required columns', function () {
    expect(Schema::hasTable('saloon_tools'))->toBeTrue();
    foreach ([
        'id', 'location_id', 'name', 'quantity', 'unit_cost',
        'purchase_date', 'recorded_by', 'created_at', 'updated_at',
    ] as $col) {
        expect(Schema::hasColumn('saloon_tools', $col))->toBeTrue();
    }
});

it('expenses.business_line defaults to shop', function () {
    expect(Schema::hasColumn('expenses', 'business_line'))->toBeTrue();

    $shopId = DB::table('locations')->insertGetId(['name' => 'BLShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $userId = DB::table('users')->insertGetId(['name' => 'BLUser', 'email' => 'bluser'.uniqid().'@test.com', 'password' => 'x', 'role' => 'admin', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

    $id = DB::table('expenses')->insertGetId([
        'location_id' => $shopId, 'category' => 'rent', 'amount' => 1000,
        'expense_date' => today(), 'recorded_by' => $userId,
        'created_at' => now(), 'updated_at' => now(),
    ]);

    expect(DB::table('expenses')->find($id)->business_line)->toBe('shop');
});

it('saloon_tools asset value is quantity times unit_cost', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'ToolShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $userId = DB::table('users')->insertGetId(['name' => 'ToolUser', 'email' => 'tooluser'.uniqid().'@test.com', 'password' => 'x', 'role' => 'admin', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

    $id = DB::table('saloon_tools')->insertGetId([
        'location_id' => $shopId, 'name' => 'Hair Dryer', 'quantity' => 3, 'unit_cost' => 50000,
        'purchase_date' => today(), 'recorded_by' => $userId,
        'created_at' => now(), 'updated_at' => now(),
    ]);

    $row = DB::table('saloon_tools')->find($id);
    expect((int) $row->quantity * (float) $row->unit_cost)->toBe(150000.0);
});
