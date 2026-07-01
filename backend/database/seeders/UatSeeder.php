<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class UatSeeder extends Seeder
{
    public function run(): void
    {
        // Seeders run as the app user (RLS-enforced). Set admin GUC so policies pass.
        DB::statement("SELECT set_config('app.role', 'admin', false)");
        DB::statement("SELECT set_config('app.user_id', '0', false)");
        DB::statement("SELECT set_config('app.location_ids', '[]', false)");

        $this->call([
            RoleSeeder::class,
            LocationSeeder::class,
            CategorySeeder::class,
        ]);

        // ── Locations ─────────────────────────────────────────────────────
        $storeId = DB::table('locations')->where('type', 'store')->value('id');
        $shopIds = DB::table('locations')->where('type', 'shop')->pluck('id')->toArray();

        // ── Users ─────────────────────────────────────────────────────────
        $admin = User::firstOrCreate(['email' => 'admin@hairbeauty.local'], [
            'name' => 'Administrator',
            'password' => Hash::make('admin2026!'),
            'role' => 'admin',
            'is_active' => true,
        ]);

        $storeKeeper = User::firstOrCreate(['email' => 'storekeeper@hairbeauty.local'], [
            'name' => 'Store Keeper',
            'password' => Hash::make('keeper2026!'),
            'role' => 'store_keeper',
            'location_id' => $storeId,
            'is_active' => true,
        ]);

        $sellers = [];
        foreach ($shopIds as $i => $shopId) {
            $sellers[$shopId] = User::firstOrCreate(['email' => "seller{$i}@hairbeauty.local"], [
                'name' => "Seller {$i}",
                'password' => Hash::make('seller2026!'),
                'role' => 'seller',
                'location_id' => $shopId,
                'is_active' => true,
            ]);
        }

        // ── Products + Batches ─────────────────────────────────────────────
        $this->call(UatProductSeeder::class);

        // ── Purchases (last 90 days) ───────────────────────────────────────
        $this->call([UatSalesSeeder::class]);
    }
}
