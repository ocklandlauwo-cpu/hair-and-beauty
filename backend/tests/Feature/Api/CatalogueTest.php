<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

// ── Categories ────────────────────────────────────────────────────────────
it('any authenticated role can list categories', function () {
    DB::table('categories')->insertOrIgnore([
        ['name' => 'Hair',      'created_at' => now(), 'updated_at' => now()],
        ['name' => 'Cosmetics', 'created_at' => now(), 'updated_at' => now()],
    ]);
    Sanctum::actingAs(User::factory()->seller()->create());

    $this->getJson('/api/v1/categories')
        ->assertOk()
        ->assertJsonStructure(['data' => [['id', 'name']]]);
});

// ── Products ──────────────────────────────────────────────────────────────
it('admin can create a product', function () {
    $catId = DB::table('categories')->insertGetId(['name' => 'TestCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/products', [
        'category_id'     => $catId,
        'name'            => 'Shea Butter 250ml',
        'sku'             => 'SB-250',
        'wholesale_price' => 8000,
        'retail_price'    => 12000,
    ])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Shea Butter 250ml')
        ->assertJsonPath('data.wholesale_threshold', 12)
        ->assertJsonPath('data.latest_cost', '0.00');
});

it('seller cannot create a product', function () {
    $catId = DB::table('categories')->insertGetId(['name' => 'Cat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->seller()->create());

    $this->postJson('/api/v1/products', [
        'category_id'     => $catId,
        'name'            => 'Soap',
        'wholesale_price' => 1000,
        'retail_price'    => 1500,
    ])->assertForbidden();
});

it('any authenticated role can list products', function () {
    Sanctum::actingAs(User::factory()->storeKeeper()->create());
    $this->getJson('/api/v1/products')->assertOk()->assertJsonStructure(['data', 'meta']);
});

it('admin can update a product', function () {
    $catId  = DB::table('categories')->insertGetId(['name' => 'Cat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'OldName', 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->putJson("/api/v1/products/{$prodId}", ['name' => 'NewName', 'wholesale_price' => 100, 'retail_price' => 150])
        ->assertOk()
        ->assertJsonPath('data.name', 'NewName');
});

// ── Batches ───────────────────────────────────────────────────────────────
it('store_keeper can create a batch for a product', function () {
    $catId  = DB::table('categories')->insertGetId(['name' => 'BC'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'BProduct', 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->storeKeeper()->create());

    $this->postJson("/api/v1/products/{$prodId}/batches", [
        'batch_number' => 'BATCH-001',
        'expiry_date'  => now()->addYear()->toDateString(),
    ])
        ->assertCreated()
        ->assertJsonPath('data.batch_number', 'BATCH-001');
});

it('seller cannot create a batch', function () {
    $catId  = DB::table('categories')->insertGetId(['name' => 'BS'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'BP2', 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->seller()->create());

    $this->postJson("/api/v1/products/{$prodId}/batches", ['batch_number' => 'X'])
        ->assertForbidden();
});
