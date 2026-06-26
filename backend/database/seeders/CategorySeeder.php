<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $now = now();
        DB::table('categories')->insertOrIgnore([
            ['name' => 'Hair',      'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Cosmetics', 'created_at' => $now, 'updated_at' => $now],
        ]);
    }
}
