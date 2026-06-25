<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['admin', 'store_keeper', 'seller'] as $name) {
            Role::firstOrCreate([
                'name' => $name,
                'guard_name' => 'sanctum',
            ]);
        }
    }
}
