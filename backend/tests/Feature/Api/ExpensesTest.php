<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('seller can record an expense for their shop', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'ExpShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    Sanctum::actingAs($seller);
    $locationIdsJson = json_encode([$shopId]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->postJson('/api/v1/expenses', [
            'category'     => 'rent',
            'amount'       => 500000,
            'expense_date' => today()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('data.category', 'rent')
            ->assertJsonPath('data.amount', '500000.00')
            ->assertJsonPath('data.location_id', $shopId);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('admin can record an expense for any location', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'AdminExpShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/expenses', [
        'category'     => 'electricity',
        'amount'       => 75000,
        'expense_date' => today()->toDateString(),
        'location_id'  => $shopId,
    ])
        ->assertCreated()
        ->assertJsonPath('data.location_id', $shopId);
});

it('expense category must be valid', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'ValShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->seller()->create(['location_id' => $shopId]));

    $this->postJson('/api/v1/expenses', [
        'category'     => 'invalid_category',
        'amount'       => 100,
        'expense_date' => today()->toDateString(),
    ])->assertUnprocessable();
});

it('expense_date is returned as a plain date string with no time component', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'DateShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $seller = User::factory()->seller()->create(['location_id' => $shopId]);
    Sanctum::actingAs($seller);
    $locationIdsJson = json_encode([$shopId]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $expectedDate = today()->toDateString();

        $createRes = $this->postJson('/api/v1/expenses', [
            'category'     => 'rent',
            'amount'       => 100000,
            'expense_date' => $expectedDate,
        ])->assertCreated();

        expect($createRes->json('data.expense_date'))->toBe($expectedDate);

        $expenseId = $createRes->json('data.id');
        $this->getJson("/api/v1/expenses/{$expenseId}")
            ->assertOk()
            ->assertJsonPath('data.expense_date', $expectedDate);

        $listRes = $this->getJson('/api/v1/expenses')->assertOk();
        $row = collect($listRes->json('data'))->firstWhere('id', $expenseId);
        expect($row['expense_date'])->toBe($expectedDate);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('admin can list all expenses', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'ListShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $seller  = User::factory()->seller()->create(['location_id' => $shopId]);
    DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'salary', 'amount' => 300000, 'expense_date' => today(), 'recorded_by' => $seller->id, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->getJson('/api/v1/expenses')->assertOk()->assertJsonStructure(['data', 'meta']);
});
