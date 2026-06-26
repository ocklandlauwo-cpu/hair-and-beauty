<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Helpers shared across tests in this file
function seedStockTestFixtures(): array
{
    $catId  = DB::table('categories')->insertGetId(['name' => 'StockCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $locId  = DB::table('locations')->insertGetId(['name' => 'Store'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $userId = DB::table('users')->insertGetId(['name' => 'SK', 'email' => uniqid().'@x.com', 'password' => bcrypt('x'), 'role' => 'store_keeper', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'Prod'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);

    return compact('catId', 'locId', 'userId', 'prodId');
}

it('purchases table has required columns', function () {
    expect(Schema::hasTable('purchases'))->toBeTrue();
    foreach (['id', 'purchased_by', 'supplier_name', 'invoice_number', 'purchase_date', 'notes', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('purchases', $col))->toBeTrue();
    }
});

it('purchase_items table has required columns', function () {
    expect(Schema::hasTable('purchase_items'))->toBeTrue();
    foreach (['id', 'purchase_id', 'product_id', 'batch_id', 'quantity', 'unit_cost', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('purchase_items', $col))->toBeTrue();
    }
});

it('stock_movements table has required columns and no updated_at', function () {
    expect(Schema::hasTable('stock_movements'))->toBeTrue();
    foreach (['id', 'product_id', 'location_id', 'movement_type', 'quantity',
              'reference_type', 'reference_id', 'batch_id', 'unit_cost',
              'performed_by', 'notes', 'created_at'] as $col) {
        expect(Schema::hasColumn('stock_movements', $col))->toBeTrue();
    }
    expect(Schema::hasColumn('stock_movements', 'updated_at'))->toBeFalse();
});

it('fn_update_product_latest_cost trigger updates latest_cost on purchase_items insert', function () {
    $f = seedStockTestFixtures();
    $purchaseId = DB::table('purchases')->insertGetId(['purchased_by' => $f['userId'], 'purchase_date' => today(), 'created_at' => now(), 'updated_at' => now()]);

    DB::table('purchase_items')->insert([
        'purchase_id' => $purchaseId,
        'product_id'  => $f['prodId'],
        'quantity'    => 10,
        'unit_cost'   => 85.50,
        'created_at'  => now(),
        'updated_at'  => now(),
    ]);

    $latestCost = DB::table('products')->where('id', $f['prodId'])->value('latest_cost');
    expect((float) $latestCost)->toBe(85.50);
});

it('stock_movements is immutable — UPDATE raises exception', function () {
    $f = seedStockTestFixtures();
    $smId = DB::table('stock_movements')->insertGetId([
        'product_id'     => $f['prodId'],
        'location_id'    => $f['locId'],
        'movement_type'  => 'purchase',
        'quantity'       => 10,
        'reference_type' => 'purchase',
        'reference_id'   => 1,
        'unit_cost'      => 50.00,
        'performed_by'   => $f['userId'],
        'created_at'     => now(),
    ]);

    expect(fn () => DB::transaction(fn () => DB::table('stock_movements')->where('id', $smId)->update(['quantity' => 99])))
        ->toThrow(\Illuminate\Database\QueryException::class);
});

it('stock_movements is immutable — DELETE raises exception', function () {
    $f = seedStockTestFixtures();
    $smId = DB::table('stock_movements')->insertGetId([
        'product_id'     => $f['prodId'],
        'location_id'    => $f['locId'],
        'movement_type'  => 'purchase',
        'quantity'       => 5,
        'reference_type' => 'purchase',
        'reference_id'   => 1,
        'unit_cost'      => 50.00,
        'performed_by'   => $f['userId'],
        'created_at'     => now(),
    ]);

    expect(fn () => DB::transaction(fn () => DB::table('stock_movements')->where('id', $smId)->delete()))
        ->toThrow(\Illuminate\Database\QueryException::class);
});

it('fn_get_stock returns sum of movements for product+location', function () {
    $f = seedStockTestFixtures();

    DB::table('stock_movements')->insert([
        ['product_id' => $f['prodId'], 'location_id' => $f['locId'], 'movement_type' => 'purchase', 'quantity' => 20, 'reference_type' => 'purchase', 'reference_id' => 1, 'unit_cost' => 50, 'performed_by' => $f['userId'], 'created_at' => now()],
        ['product_id' => $f['prodId'], 'location_id' => $f['locId'], 'movement_type' => 'sale',     'quantity' => -3, 'reference_type' => 'sale',     'reference_id' => 1, 'unit_cost' => 50, 'performed_by' => $f['userId'], 'created_at' => now()],
    ]);

    $stock = DB::selectOne('SELECT fn_get_stock(?, ?) AS qty', [$f['prodId'], $f['locId']]);
    expect((int) $stock->qty)->toBe(17);
});
