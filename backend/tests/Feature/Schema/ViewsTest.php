<?php

use Illuminate\Support\Facades\DB;

function seedViewTestData(): array
{
    $now    = now();
    $locId  = DB::table('locations')->insertGetId(['name' => 'ViewStore'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
    $userId = DB::table('users')->insertGetId(['name' => 'V', 'email' => uniqid().'@v.com', 'password' => bcrypt('x'), 'role' => 'store_keeper', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
    $catId  = DB::table('categories')->insertGetId(['name' => 'VC'.uniqid(), 'created_at' => $now, 'updated_at' => $now]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'VP'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => $now, 'updated_at' => $now]);

    return compact('locId', 'userId', 'catId', 'prodId', 'now');
}

it('v_current_stock view exists and returns stock balance', function () {
    $f = seedViewTestData();

    DB::table('stock_movements')->insert([
        ['product_id' => $f['prodId'], 'location_id' => $f['locId'], 'movement_type' => 'purchase', 'quantity' => 30, 'reference_type' => 'purchase', 'reference_id' => 1, 'unit_cost' => 50, 'performed_by' => $f['userId'], 'created_at' => $f['now']],
        ['product_id' => $f['prodId'], 'location_id' => $f['locId'], 'movement_type' => 'sale',     'quantity' => -5, 'reference_type' => 'sale',     'reference_id' => 1, 'unit_cost' => 50, 'performed_by' => $f['userId'], 'created_at' => $f['now']],
    ]);

    $row = DB::table('v_current_stock')
        ->where('product_id', $f['prodId'])
        ->where('location_id', $f['locId'])
        ->first();

    expect($row)->not->toBeNull();
    expect((int) $row->current_stock)->toBe(25);
});

it('v_expiry_alerts view returns batches expiring within 60 days', function () {
    $f       = seedViewTestData();
    $expDate = now()->addDays(30)->toDateString();

    $batchId = DB::table('batches')->insertGetId([
        'product_id'  => $f['prodId'],
        'batch_number' => 'EXP-TEST',
        'expiry_date' => $expDate,
        'created_at'  => $f['now'],
        'updated_at'  => $f['now'],
    ]);

    $row = DB::table('v_expiry_alerts')->where('batch_id', $batchId)->first();
    expect($row)->not->toBeNull();
    expect((int) $row->days_until_expiry)->toBeLessThanOrEqual(60);
});

it('v_low_stock_alerts view exists', function () {
    // Verify the view is queryable (no error)
    $result = DB::table('v_low_stock_alerts')->limit(1)->get();
    expect($result)->toBeInstanceOf(\Illuminate\Support\Collection::class);
});
