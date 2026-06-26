<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class LocationSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();
        DB::table('locations')->insertOrIgnore([
            ['name' => 'Central Store', 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Shop 1',         'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Shop 2',         'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Shop 3',         'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }
}
