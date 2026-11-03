<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function bankFixtures(): array
{
    $shopId = DB::table('locations')->insertGetId(['name' => 'BShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin  = User::factory()->admin()->create();
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    $day    = today()->subDay()->toDateString();

    $sale = fn (string $method, float $amount, bool $reverted = false) => DB::table('sales')->insert([
        'location_id' => $shopId, 'sold_by' => $seller->id, 'payment_method' => $method,
        'total_amount' => $amount, 'discount_amount' => 0, 'is_reverted' => $reverted,
        'sale_date' => $day, 'created_at' => now(), 'updated_at' => now(),
    ]);
    $sale('cash', 10000);
    $sale('cash', 5000);
    $sale('nmb', 7000);
    $sale('airtel', 3000);
    $sale('cash', 99999, true);

    return compact('shopId', 'admin', 'seller', 'day');
}

it('sales report splits a shop day by payment method and excludes reverted sales', function () {
    $f = bankFixtures();
    Sanctum::actingAs($f['admin']);

    $this->getJson("/api/v1/reports/sales?from={$f['day']}&to={$f['day']}&location_id={$f['shopId']}")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.cash', '15000.00')
        ->assertJsonPath('data.0.nmb', '7000.00')
        ->assertJsonPath('data.0.mobile', '3000.00')
        ->assertJsonPath('data.0.total', '25000.00')
        ->assertJsonPath('data.0.deposit', null);
});

it('verifying a deposit snapshots the cash total, shows on the report, and counts as money in', function () {
    $f = bankFixtures();
    Sanctum::actingAs($f['admin']);
    $before = (float) $this->getJson('/api/v1/bank/summary')->json('data.money_in');

    $this->postJson('/api/v1/bank-deposits', [
        'location_id' => $f['shopId'], 'deposit_date' => $f['day'], 'slip_reference' => 'SLIP-123',
    ])->assertCreated()->assertJsonPath('data.amount', '15000.00');

    $this->getJson("/api/v1/reports/sales?from={$f['day']}&to={$f['day']}&location_id={$f['shopId']}")
        ->assertJsonPath('data.0.deposit.amount', '15000.00')
        ->assertJsonPath('data.0.deposit.slip_reference', 'SLIP-123');

    expect((float) $this->getJson('/api/v1/bank/summary')->json('data.money_in'))->toBe($before + 15000);
});

it('rejects verifying the same day twice', function () {
    $f = bankFixtures();
    Sanctum::actingAs($f['admin']);
    $payload = ['location_id' => $f['shopId'], 'deposit_date' => $f['day']];

    $this->postJson('/api/v1/bank-deposits', $payload)->assertCreated();
    $this->travel(11)->seconds(); // step past the duplicate-submission window
    $this->postJson('/api/v1/bank-deposits', $payload)->assertStatus(422);
});

it('unverifying a deposit removes it from money in', function () {
    $f = bankFixtures();
    Sanctum::actingAs($f['admin']);
    $before = (float) $this->getJson('/api/v1/bank/summary')->json('data.money_in');

    $id = $this->postJson('/api/v1/bank-deposits', ['location_id' => $f['shopId'], 'deposit_date' => $f['day']])->json('data.id');
    $this->deleteJson("/api/v1/bank-deposits/{$id}")->assertNoContent();

    expect((float) $this->getJson('/api/v1/bank/summary')->json('data.money_in'))->toBe($before);
});

it('withdrawals count as money out and reduce the current amount', function () {
    $f = bankFixtures();
    Sanctum::actingAs($f['admin']);
    $before = $this->getJson('/api/v1/bank/summary')->json('data');

    $this->postJson('/api/v1/bank-withdrawals', [
        'amount' => 4000, 'withdrawal_date' => today()->toDateString(), 'reason' => 'Supplier payment',
    ])->assertCreated();

    $after = $this->getJson('/api/v1/bank/summary')->assertOk()->json('data');
    expect((float) $after['money_out'])->toBe((float) $before['money_out'] + 4000);
    expect((float) $after['current_amount'])->toBe((float) $before['current_amount'] - 4000);
    expect($after['recent_withdrawals'][0]['reason'])->toBe('Supplier payment');
});

it('non-admins cannot see the sales report or touch the bank', function () {
    $f = bankFixtures();
    Sanctum::actingAs($f['seller']);

    $this->getJson("/api/v1/reports/sales?from={$f['day']}&to={$f['day']}")->assertForbidden();
    $this->getJson('/api/v1/bank/summary')->assertForbidden();
    $this->postJson('/api/v1/bank-deposits', ['location_id' => $f['shopId'], 'deposit_date' => $f['day']])->assertForbidden();
    $this->postJson('/api/v1/bank-withdrawals', ['amount' => 1, 'withdrawal_date' => $f['day'], 'reason' => 'x'])->assertForbidden();
});
