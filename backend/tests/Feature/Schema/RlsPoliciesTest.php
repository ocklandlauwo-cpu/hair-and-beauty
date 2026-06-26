<?php

use Illuminate\Support\Facades\DB;

/**
 * RLS helper: set GUC context, run callback, then RESET.
 */
function withRlsContext(string $role, string $locationIdsJson, callable $callback): mixed
{
    DB::statement('SELECT set_config(?, ?, false)', ['app.role', $role]);
    DB::statement('SELECT set_config(?, ?, false)', ['app.location_ids', $locationIdsJson]);
    try {
        return $callback();
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
}

function seedRlsFixtures(): array
{
    // Ensure admin role is set so RLS policies allow inserts
    DB::statement("SELECT set_config('app.role', 'admin', false)");
    DB::statement("SELECT set_config('app.location_ids', '[]', false)");

    $now = now();
    $loc1 = DB::table('locations')->insertGetId(['name' => 'Store'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
    $loc2 = DB::table('locations')->insertGetId(['name' => 'Shop'.uniqid(),  'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
    $loc3 = DB::table('locations')->insertGetId(['name' => 'Shop2'.uniqid(), 'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);

    $admin = DB::table('users')->insertGetId(['name' => 'Admin',  'email' => uniqid().'@a.com', 'password' => bcrypt('x'), 'role' => 'admin',   'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
    $seller = DB::table('users')->insertGetId(['name' => 'Seller', 'email' => uniqid().'@s.com', 'password' => bcrypt('x'), 'role' => 'seller',  'location_id' => $loc2, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);

    $catId = DB::table('categories')->insertGetId(['name' => 'RC'.uniqid(), 'created_at' => $now, 'updated_at' => $now]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'RP'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => $now, 'updated_at' => $now]);

    // Sales at loc2 and loc3
    $sale2 = DB::table('sales')->insertGetId(['location_id' => $loc2, 'sold_by' => $seller, 'payment_method' => 'nmb',  'total_amount' => 100, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => $now, 'updated_at' => $now]);
    $sale3 = DB::table('sales')->insertGetId(['location_id' => $loc3, 'sold_by' => $admin,  'payment_method' => 'tigo', 'total_amount' => 200, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => $now, 'updated_at' => $now]);

    // Expenses at loc2
    DB::table('expenses')->insert(['location_id' => $loc2, 'category' => 'rent', 'amount' => 500, 'expense_date' => today(), 'recorded_by' => $seller, 'created_at' => $now, 'updated_at' => $now]);
    // Expenses at loc3
    DB::table('expenses')->insert(['location_id' => $loc3, 'category' => 'rent', 'amount' => 600, 'expense_date' => today(), 'recorded_by' => $admin,  'created_at' => $now, 'updated_at' => $now]);

    return compact('loc1', 'loc2', 'loc3', 'admin', 'seller', 'catId', 'prodId', 'sale2', 'sale3');
}

it('seller can only SELECT sales for their own location', function () {
    $f = seedRlsFixtures();

    $sales = withRlsContext('seller', json_encode([$f['loc2']]), fn () => DB::table('sales')->get()
    );

    expect($sales->count())->toBe(1);
    expect((int) $sales->first()->location_id)->toBe($f['loc2']);
});

it('admin can SELECT all sales regardless of location', function () {
    $f = seedRlsFixtures();

    $sales = withRlsContext('admin', '[]', fn () => DB::table('sales')->get()
    );

    // Admin should see at least the two sales created in this test
    expect($sales->count())->toBeGreaterThanOrEqual(2);
});

it('store_keeper can SELECT all sales (for reporting)', function () {
    $f = seedRlsFixtures();

    $sales = withRlsContext('store_keeper', json_encode([$f['loc1']]), fn () => DB::table('sales')->get()
    );

    expect($sales->count())->toBeGreaterThanOrEqual(2);
});

it('seller can only SELECT expenses for their own location', function () {
    $f = seedRlsFixtures();

    $expenses = withRlsContext('seller', json_encode([$f['loc2']]), fn () => DB::table('expenses')->get()
    );

    $locationIds = $expenses->pluck('location_id')->unique()->all();
    expect($locationIds)->each->toBe($f['loc2']);
});

it('seller can SELECT all products (global resource)', function () {
    $f = seedRlsFixtures();

    $products = withRlsContext('seller', json_encode([$f['loc2']]), fn () => DB::table('products')->where('id', $f['prodId'])->get()
    );

    expect($products->count())->toBe(1);
});

it('guest (no role GUC) cannot SELECT any sales', function () {
    $f = seedRlsFixtures();

    // GUCs are reset/empty — guest context
    DB::unprepared('RESET app.role');
    DB::unprepared('RESET app.location_ids');

    $sales = DB::table('sales')->get();
    expect($sales->count())->toBe(0);
});
