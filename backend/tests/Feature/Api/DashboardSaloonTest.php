<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin dashboard includes a saloon block with sales, profit at 75%, expenses, and asset value', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'DashSaloonShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = User::factory()->admin()->create();
    Sanctum::actingAs($admin);
    DB::statement("SELECT set_config('app.role', 'admin', false)");

    $providerId = DB::table('providers')->insertGetId(['name' => 'DashProvider', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'DashService', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

    // 10,000 sold today at this shop
    DB::table('saloon_sales')->insert(['location_id' => $shopId, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 10000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);

    // A saloon-tagged expense this month, and a shop-tagged one — only the saloon one should count toward the saloon card
    DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'rent', 'amount' => 4000, 'business_line' => 'saloon', 'expense_date' => today(), 'recorded_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'rent', 'amount' => 9999, 'business_line' => 'shop', 'expense_date' => today(), 'recorded_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);

    // A tool purchase: 2 x 25,000 = 50,000 capital
    DB::table('saloon_tools')->insert(['location_id' => $shopId, 'name' => 'Clipper', 'quantity' => 2, 'unit_cost' => 25000, 'purchase_date' => today(), 'recorded_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);

    DB::unprepared('RESET app.role');

    $res = $this->getJson('/api/v1/dashboard')->assertOk();

    expect($res->json('data.saloon.sales.today'))->toBe('10000.00');
    expect($res->json('data.saloon.profit.today'))->toBe('7500.00'); // 75% of 10,000
    expect($res->json('data.saloon.expenses.this_month'))->toBe('4000.00'); // only the saloon-tagged one
    expect($res->json('data.saloon.asset_value.total'))->toBe('50000.00');

    $salesByShop = collect($res->json('data.saloon.sales.today_by_shop'))->firstWhere('location_id', $shopId);
    expect($salesByShop['total'])->toBe('10000.00');
});

it('a shop-tagged expense does not appear in the saloon expenses figure', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'DashShopOnly'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = User::factory()->admin()->create();
    Sanctum::actingAs($admin);

    DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'rent', 'amount' => 5000, 'business_line' => 'shop', 'expense_date' => today(), 'recorded_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);

    $res = $this->getJson('/api/v1/dashboard')->assertOk();
    expect((float) $res->json('data.saloon.expenses.this_month'))->toBe(0.0);
});
