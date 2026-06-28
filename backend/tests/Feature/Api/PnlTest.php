<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function pnlFixtures(): array
{
    $shopId  = DB::table('locations')->insertGetId(['name' => 'PnlShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $catId   = DB::table('categories')->insertGetId(['name' => 'PnlCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId  = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'PnlProd'.uniqid(), 'wholesale_price' => 10000, 'retail_price' => 15000, 'latest_cost' => 8000, 'created_at' => now(), 'updated_at' => now()]);
    $seller  = User::factory()->seller()->create(['location_id' => $shopId]);
    $admin   = User::factory()->admin()->create();

    // Insert a sale
    $saleId = DB::table('sales')->insertGetId(['location_id' => $shopId, 'sold_by' => $seller->id, 'payment_method' => 'nmb', 'total_amount' => 15000, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleId, 'product_id' => $prodId, 'quantity' => 1, 'unit_price' => 15000, 'unit_cost' => 8000, 'price_tier' => 'retail', 'created_at' => now()]);

    // Insert an expense
    DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'rent', 'amount' => 500000, 'expense_date' => today(), 'recorded_by' => $seller->id, 'created_at' => now(), 'updated_at' => now()]);

    return compact('shopId', 'seller', 'admin');
}

it('admin can retrieve P&L for a specific location', function () {
    $f = pnlFixtures();
    Sanctum::actingAs($f['admin']);

    $response = $this->getJson("/api/v1/reports/pnl?location_id={$f['shopId']}&from=".today()->toDateString().'&to='.today()->toDateString());

    $response->assertOk()
        ->assertJsonPath('data.revenue', '15000.00')
        ->assertJsonPath('data.cost_of_goods_sold', '8000.00')
        ->assertJsonPath('data.gross_profit', '7000.00')
        ->assertJsonPath('data.expenses', '500000.00')
        ->assertJsonPath('data.net_profit', '-493000.00');
});

it('seller P&L is scoped to their location automatically', function () {
    $f = pnlFixtures();
    Sanctum::actingAs($f['seller']);
    $locationIdsJson = json_encode([$f['shopId']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $response = $this->getJson('/api/v1/reports/pnl?from='.today()->toDateString().'&to='.today()->toDateString());

        $response->assertOk()
            ->assertJsonPath('data.location_id', $f['shopId'])
            ->assertJsonPath('data.revenue', '15000.00');
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('reverted sales are excluded from P&L', function () {
    $f    = pnlFixtures();
    $admin = $f['admin'];

    // Create a reverted sale
    $saleId = DB::table('sales')->insertGetId(['location_id' => $f['shopId'], 'sold_by' => $f['seller']->id, 'payment_method' => 'nmb', 'total_amount' => 30000, 'discount_amount' => 0, 'is_reverted' => true, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sale_items')->insert(['sale_id' => $saleId, 'product_id' => DB::table('products')->first()->id, 'quantity' => 2, 'unit_price' => 15000, 'unit_cost' => 8000, 'price_tier' => 'retail', 'created_at' => now()]);

    Sanctum::actingAs($admin);
    $response = $this->getJson("/api/v1/reports/pnl?location_id={$f['shopId']}&from=".today()->toDateString().'&to='.today()->toDateString());

    // Revenue should still be 15000 (only the non-reverted sale from fixtures)
    $response->assertOk()->assertJsonPath('data.revenue', '15000.00');
});
