<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

it('products table has all required columns', function () {
    expect(Schema::hasTable('products'))->toBeTrue();
    foreach ([
        'id', 'category_id', 'name', 'sku', 'unit',
        'wholesale_threshold', 'wholesale_price', 'retail_price',
        'latest_cost', 'image_path', 'is_active', 'created_at', 'updated_at',
    ] as $col) {
        expect(Schema::hasColumn('products', $col))->toBeTrue();
    }
});

it('products.wholesale_threshold defaults to 12', function () {
    $catId = DB::table('categories')->insertGetId(['name' => 'TestCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);

    $id = DB::table('products')->insertGetId([
        'category_id'     => $catId,
        'name'            => 'Test Product',
        'wholesale_price' => 100.00,
        'retail_price'    => 150.00,
        'created_at'      => now(),
        'updated_at'      => now(),
    ]);

    $product = DB::table('products')->find($id);
    expect((int) $product->wholesale_threshold)->toBe(12);
    expect((float) $product->latest_cost)->toBe(0.0);
    expect((bool) $product->is_active)->toBeTrue();
});

it('batches table has all required columns', function () {
    expect(Schema::hasTable('batches'))->toBeTrue();
    foreach (['id', 'product_id', 'batch_number', 'expiry_date', 'notes', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('batches', $col))->toBeTrue();
    }
});

it('sku is unique on products', function () {
    $catId = DB::table('categories')->insertGetId(['name' => 'SkuCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $base = ['category_id' => $catId, 'name' => 'P', 'wholesale_price' => 1, 'retail_price' => 2, 'sku' => 'SKU-UNIQUE-'.uniqid(), 'created_at' => now(), 'updated_at' => now()];

    DB::table('products')->insert($base);
    expect(fn () => DB::table('products')->insert($base))->toThrow(\Illuminate\Database\QueryException::class);
});
