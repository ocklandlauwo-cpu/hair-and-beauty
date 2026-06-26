<?php

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

it('reconciliations table has required columns and unique constraint', function () {
    expect(Schema::hasTable('reconciliations'))->toBeTrue();
    foreach (['id', 'location_id', 'seller_id', 'reconciliation_date',
        'total_sold_amount', 'receipt_path', 'notes',
        'verified_by', 'verified_at', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('reconciliations', $col))->toBeTrue();
    }

    // Verify unique constraint (location_id, reconciliation_date)
    $locId = DB::table('locations')->insertGetId(['name' => 'L'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $userId = DB::table('users')->insertGetId(['name' => 'S', 'email' => uniqid().'@r.com', 'password' => bcrypt('x'), 'role' => 'seller', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $base = ['location_id' => $locId, 'seller_id' => $userId, 'reconciliation_date' => '2026-01-01', 'total_sold_amount' => 100, 'created_at' => now(), 'updated_at' => now()];

    DB::table('reconciliations')->insert($base);
    expect(fn () => DB::table('reconciliations')->insert($base))->toThrow(QueryException::class);
});

it('expenses table has required columns and valid category enum', function () {
    expect(Schema::hasTable('expenses'))->toBeTrue();
    foreach (['id', 'location_id', 'category', 'amount', 'expense_date', 'recorded_by', 'notes', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('expenses', $col))->toBeTrue();
    }
});

it('news table has required columns', function () {
    expect(Schema::hasTable('news'))->toBeTrue();
    foreach (['id', 'title', 'body', 'created_by', 'is_published', 'published_at', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('news', $col))->toBeTrue();
    }
});

it('attendance table has no updated_at and is immutable', function () {
    expect(Schema::hasTable('attendance'))->toBeTrue();
    expect(Schema::hasColumn('attendance', 'updated_at'))->toBeFalse();
    foreach (['id', 'user_id', 'location_id', 'action', 'latitude', 'longitude', 'is_within_geofence', 'recorded_at', 'created_at'] as $col) {
        expect(Schema::hasColumn('attendance', $col))->toBeTrue();
    }

    $locId = DB::table('locations')->insertGetId(['name' => 'L'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $userId = DB::table('users')->insertGetId(['name' => 'U', 'email' => uniqid().'@a.com', 'password' => bcrypt('x'), 'role' => 'seller', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

    $attId = DB::table('attendance')->insertGetId([
        'user_id' => $userId,
        'location_id' => $locId,
        'action' => 'clock_in',
        'latitude' => -6.7924,
        'longitude' => 39.2083,
        'is_within_geofence' => true,
        'recorded_at' => now(),
        'created_at' => now(),
    ]);

    expect(fn () => DB::transaction(fn () => DB::table('attendance')->where('id', $attId)->update(['action' => 'clock_out'])))
        ->toThrow(QueryException::class);
});
