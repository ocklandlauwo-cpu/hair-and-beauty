<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

it('distributions table has required columns', function () {
    expect(Schema::hasTable('distributions'))->toBeTrue();
    foreach (['id', 'from_location_id', 'to_location_id', 'distributed_by',
              'confirmed_by', 'status', 'distributed_at', 'confirmed_at',
              'notes', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('distributions', $col))->toBeTrue();
    }
});

it('distribution_items table has required columns', function () {
    expect(Schema::hasTable('distribution_items'))->toBeTrue();
    foreach (['id', 'distribution_id', 'product_id', 'batch_id',
              'quantity_sent', 'quantity_received', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('distribution_items', $col))->toBeTrue();
    }
});

it('clients table has required columns', function () {
    expect(Schema::hasTable('clients'))->toBeTrue();
    foreach (['id', 'location_id', 'name', 'phone', 'notes', 'is_active', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('clients', $col))->toBeTrue();
    }
});

it('sales table has required columns', function () {
    expect(Schema::hasTable('sales'))->toBeTrue();
    foreach (['id', 'location_id', 'sold_by', 'client_id', 'payment_method',
              'total_amount', 'discount_amount', 'is_reverted', 'reverted_by',
              'reverted_at', 'revert_reason', 'sale_date', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('sales', $col))->toBeTrue();
    }
});

it('sale_items table has no updated_at and is immutable', function () {
    expect(Schema::hasTable('sale_items'))->toBeTrue();
    expect(Schema::hasColumn('sale_items', 'updated_at'))->toBeFalse();

    $locId  = DB::table('locations')->insertGetId(['name' => 'L'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $userId = DB::table('users')->insertGetId(['name' => 'S', 'email' => uniqid().'@s.com', 'password' => bcrypt('x'), 'role' => 'seller', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId  = DB::table('categories')->insertGetId(['name' => 'C'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'P'.uniqid(), 'wholesale_price' => 10, 'retail_price' => 20, 'created_at' => now(), 'updated_at' => now()]);

    $saleId = DB::table('sales')->insertGetId([
        'location_id'     => $locId,
        'sold_by'         => $userId,
        'payment_method'  => 'nmb',
        'total_amount'    => 20.00,
        'discount_amount' => 0,
        'sale_date'       => today(),
        'created_at'      => now(),
        'updated_at'      => now(),
    ]);

    $siId = DB::table('sale_items')->insertGetId([
        'sale_id'    => $saleId,
        'product_id' => $prodId,
        'quantity'   => 1,
        'unit_price' => 20.00,
        'unit_cost'  => 10.00,
        'price_tier' => 'retail',
        'created_at' => now(),
    ]);

    expect(fn () => DB::table('sale_items')->where('id', $siId)->update(['quantity' => 99]))
        ->toThrow(\Illuminate\Database\QueryException::class);
});
