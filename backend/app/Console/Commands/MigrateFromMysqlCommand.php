<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class MigrateFromMysqlCommand extends Command
{
    protected $signature = 'migrate:from-mysql {--dry-run : Print what would be inserted without writing}';

    protected $description = 'Migrate legacy MySQL data to PostgreSQL (one-time ETL)';

    public function handle(): int
    {
        $isDry = $this->option('dry-run');

        if ($isDry) {
            $this->info('[DRY RUN] No data will be written.');
        }

        try {
            DB::connection('mysql_legacy')->getPdo();
        } catch (\Exception $e) {
            $this->error('Cannot connect to legacy MySQL: '.$e->getMessage());
            $this->line('Set LEGACY_DB_HOST, LEGACY_DB_DATABASE, LEGACY_DB_USERNAME, LEGACY_DB_PASSWORD in .env');

            return Command::FAILURE;
        }

        $this->migrateCategories($isDry);
        $this->migrateProducts($isDry);
        $this->migrateLocations($isDry);
        $this->migrateUsers($isDry);

        $this->info($isDry ? '[DRY RUN] Migration preview complete.' : 'Migration complete.');

        return Command::SUCCESS;
    }

    private function migrateCategories(bool $isDry): void
    {
        // ── CUSTOMISE: map your legacy categories table ──────────────────
        // Example assumes legacy table: `categories` with columns `id`, `name`
        $rows = DB::connection('mysql_legacy')->table('categories')->get();
        $this->info("Categories: {$rows->count()} found");

        foreach ($rows as $row) {
            $data = ['name' => $row->name, 'created_at' => now(), 'updated_at' => now()];
            if ($isDry) {
                $this->line("  WOULD INSERT category: {$row->name}");
            } else {
                DB::table('categories')->insertOrIgnore($data);
            }
        }
    }

    private function migrateProducts(bool $isDry): void
    {
        // ── CUSTOMISE: map your legacy products table ────────────────────
        // Example assumes legacy columns: id, name, category_id, retail_price, wholesale_price, cost
        $rows = DB::connection('mysql_legacy')->table('products')->get();
        $this->info("Products: {$rows->count()} found");

        foreach ($rows as $row) {
            // Find the new category_id by name (assumes categories already migrated)
            $catId = DB::table('categories')->where('name', $row->category_name ?? 'Hair')->value('id');

            $data = [
                'category_id' => $catId ?? 1,
                'name' => $row->name,
                'retail_price' => $row->retail_price ?? 0,
                'wholesale_price' => $row->wholesale_price ?? 0,
                'latest_cost' => $row->cost ?? 0,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if ($isDry) {
                $this->line("  WOULD INSERT product: {$row->name}");
            } else {
                DB::table('products')->insertOrIgnore($data);
            }
        }
    }

    private function migrateLocations(bool $isDry): void
    {
        // ── CUSTOMISE: map your legacy shops/stores table ─────────────────
        // Example assumes legacy table: `locations` with columns `id`, `name`, `type`
        // Skip if locations are already seeded (LocationSeeder was already run)
        $existing = DB::table('locations')->count();
        if ($existing > 0) {
            $this->warn("Locations already exist ({$existing} rows) — skipping.");

            return;
        }

        $rows = DB::connection('mysql_legacy')->table('shops')->get();
        $this->info("Locations: {$rows->count()} found");

        foreach ($rows as $row) {
            $data = [
                'name' => $row->name,
                'type' => $row->type ?? 'shop',
                'geofence_radius_m' => 100,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ];
            if ($isDry) {
                $this->line("  WOULD INSERT location: {$row->name}");
            } else {
                DB::table('locations')->insertOrIgnore($data);
            }
        }
    }

    private function migrateUsers(bool $isDry): void
    {
        // ── CUSTOMISE: map your legacy users table ────────────────────────
        // Example assumes legacy columns: name, email, role, shop_id
        $rows = DB::connection('mysql_legacy')->table('users')->get();
        $this->info("Users: {$rows->count()} found");

        foreach ($rows as $row) {
            $locationId = null;
            if (! empty($row->shop_id)) {
                // Map legacy shop_id to new location id
                $locationId = DB::table('locations')->skip((int) $row->shop_id - 1)->value('id');
            }

            $data = [
                'name' => $row->name,
                'email' => $row->email,
                'password' => Hash::make('ChangeMe2026!'), // User must reset on first login
                'role' => $row->role ?? 'seller',
                'location_id' => $locationId,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if ($isDry) {
                $this->line("  WOULD INSERT user: {$row->email} ({$data['role']})");
            } else {
                DB::table('users')->insertOrIgnore($data);
            }
        }
    }
}
