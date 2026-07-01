<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class MigrateFromMysqlCommand extends Command
{
    protected $signature = 'migrate:from-mysql {--dry-run : Print what would be inserted without writing}';

    protected $description = 'Migrate legacy sonestat_smartdatabase MySQL data to PostgreSQL (one-time ETL)';

    // ── ID maps (legacy ID → new PG ID) ─────────────────────────────────────
    private array $locationMap = []; // legacy shop_id    → new location_id
    private array $productMap  = []; // legacy Item_id    → new product_id
    private array $userMap     = []; // legacy User_id    → new user_id

    // ── Only these 5 legacy users are migrated ───────────────────────────────
    private const USER_ROLES = [
        8 => 'admin',
        3 => 'store_keeper',
        4 => 'seller',
        6 => 'seller',
        7 => 'seller',
    ];

    public function handle(): int
    {
        $dry = $this->option('dry-run');

        if ($dry) {
            $this->info('[DRY RUN] No data will be written.');
        }

        try {
            DB::connection('mysql_legacy')->getPdo();
        } catch (\Exception $e) {
            $this->error('Cannot connect to legacy MySQL: '.$e->getMessage());
            $this->line('Set LEGACY_DB_* vars in .env and ensure sonestat_smartdatabase is reachable.');

            return Command::FAILURE;
        }

        $this->migrateLocations($dry);
        $this->migrateCategories($dry);
        $this->migrateProducts($dry);
        $this->migrateUsers($dry);
        $this->migrateClients($dry);
        $this->migratePurchases($dry);
        $this->migrateSales($dry);

        $this->newLine();
        $this->info($dry ? '[DRY RUN] Preview complete — no data was written.' : 'Migration complete.');

        return Command::SUCCESS;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Locations  (tbl_shops → locations)
    // ─────────────────────────────────────────────────────────────────────────
    private function migrateLocations(bool $dry): void
    {
        $this->line('');
        $this->info('── Locations ──────────────────────────────────────');

        $existing = $this->pg()->table('locations')->count();

        if ($existing > 0) {
            $this->warn("  {$existing} locations already exist — building ID map from existing names.");
            $shops = $this->legacy()->table('tbl_shops')->get();
            foreach ($shops as $shop) {
                $newId = $this->pg()->table('locations')->where('name', $shop->shopName)->value('id');
                if ($newId) {
                    $this->locationMap[$shop->id] = $newId;
                }
            }

            return;
        }

        $shops = $this->legacy()->table('tbl_shops')->orderBy('id')->get();
        $this->line("  Found {$shops->count()} shops in legacy.");

        foreach ($shops as $shop) {
            $data = [
                'name'              => $shop->shopName,
                'type'              => 'shop',
                'address'           => $shop->location ?: null,
                'geofence_lat'      => null,
                'geofence_lng'      => null,
                'geofence_radius_m' => 100,
                'is_active'         => true,
                'created_at'        => $shop->Created_date ?? now(),
                'updated_at'        => now(),
            ];

            if ($dry) {
                $this->line("  WOULD INSERT location: {$shop->shopName}");
                $this->locationMap[$shop->id] = 0;
            } else {
                $newId = $this->pg()->table('locations')->insertGetId($data);
                $this->locationMap[$shop->id] = $newId;
                $this->line("  [+] location [{$newId}]: {$shop->shopName}");
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Categories  (hardcoded: single "Hair" category)
    // ─────────────────────────────────────────────────────────────────────────
    private function migrateCategories(bool $dry): void
    {
        $this->line('');
        $this->info('── Categories ─────────────────────────────────────');

        if ($this->pg()->table('categories')->where('name', 'Hair')->exists()) {
            $this->warn("  Category 'Hair' already exists — skipping.");

            return;
        }

        if ($dry) {
            $this->line("  WOULD INSERT category: Hair");
        } else {
            $this->pg()->table('categories')->insert(['name' => 'Hair', 'created_at' => now(), 'updated_at' => now()]);
            $this->line("  [+] category: Hair");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Products  (tbl_items[Active] + tbl_prices → products)
    // ─────────────────────────────────────────────────────────────────────────
    private function migrateProducts(bool $dry): void
    {
        $this->line('');
        $this->info('── Products ───────────────────────────────────────');

        $existing = $this->pg()->table('products')->count();

        if ($existing > 0) {
            $this->warn("  {$existing} products already exist — building ID map by name.");
            $items = $this->legacy()->table('tbl_items')->where('Status', 'Active')->get();
            foreach ($items as $item) {
                $newId = $this->pg()->table('products')->where('name', $item->Item_name)->value('id');
                if ($newId) {
                    $this->productMap[$item->Item_id] = $newId;
                }
            }

            return;
        }

        $catId = $this->pg()->table('categories')->where('name', 'Hair')->value('id');
        if (! $catId && ! $dry) {
            $this->error("  Category 'Hair' not found — run migrateCategories first.");

            return;
        }

        // Build latest-price index: for each Item_id, keep the row with the highest Price_id
        $latestPrices = $this->legacy()
            ->table('tbl_prices')
            ->orderBy('Price_id')
            ->get()
            ->groupBy('Item_id')
            ->map(fn ($group) => $group->last());

        $items = $this->legacy()->table('tbl_items')->where('Status', 'Active')->orderBy('Item_id')->get();
        $this->line("  Found {$items->count()} active items in legacy.");

        $inserted = 0;

        foreach ($items as $item) {
            $price = $latestPrices->get($item->Item_id);

            $retail    = $price && $price->Reja_reja_price > 0 ? (float) $price->Reja_reja_price  : (float) ($price->Cost_perPrice ?? 0);
            $wholesale = $price && $price->Jumla_price > 0     ? (float) $price->Jumla_price       : $retail;
            $cost      = $price && $price->Buying_price > 0    ? (float) $price->Buying_price      : (float) ($price->Cost_perPrice ?? 0);

            $data = [
                'category_id'         => $catId ?? 1,
                'name'                => $item->Item_name,
                'retail_price'        => $retail,
                'wholesale_price'     => $wholesale,
                'wholesale_threshold' => 12,
                'latest_cost'         => $cost,
                'is_active'           => true,
                'created_at'          => $item->Created_date ?? now(),
                'updated_at'          => now(),
            ];

            if ($dry) {
                $this->line("  WOULD INSERT product: {$item->Item_name}  retail={$retail}  wholesale={$wholesale}");
                $this->productMap[$item->Item_id] = 0;
            } else {
                $newId = $this->pg()->table('products')->insertGetId($data);
                $this->productMap[$item->Item_id] = $newId;
                $inserted++;
            }
        }

        if (! $dry) {
            $this->line("  [+] {$inserted} products inserted.");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Users  (5 selected users → users)
    //   Emails: {legacy_email}@hairbeauty.local  (update via user-management UI)
    //   Password: Lanaz2026!  (must reset on first login)
    // ─────────────────────────────────────────────────────────────────────────
    private function migrateUsers(bool $dry): void
    {
        $this->line('');
        $this->info('── Users ──────────────────────────────────────────');

        $rows = $this->legacy()
            ->table('tbl_users')
            ->whereIn('User_id', array_keys(self::USER_ROLES))
            ->orderBy('User_id')
            ->get();

        foreach ($rows as $row) {
            $email      = $row->Email.'@hairbeauty.local';
            $role       = self::USER_ROLES[$row->User_id];
            $locationId = $this->locationMap[$row->shop_id] ?? null;

            $existingId = $this->pg()->table('users')->where('email', $email)->value('id');
            if ($existingId) {
                $this->warn("  User {$email} already exists [{$existingId}] — mapping.");
                $this->userMap[$row->User_id] = $existingId;
                continue;
            }

            $data = [
                'name'        => trim($row->First_name.' '.$row->Last_name),
                'email'       => $email,
                'password'    => Hash::make('Lanaz2026!'),
                'role'        => $role,
                'location_id' => $locationId,
                'is_active'   => true,
                'created_at'  => $row->Created_date ?? now(),
                'updated_at'  => now(),
            ];

            if ($dry) {
                $this->line("  WOULD INSERT user: {$email} ({$role})");
                $this->userMap[$row->User_id] = 0;
            } else {
                $newId = $this->pg()->table('users')->insertGetId($data);
                $this->userMap[$row->User_id] = $newId;
                $this->line("  [+] user [{$newId}]: {$email} ({$role})");
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Clients  (tbl_customer → clients)
    //   business → name,  contact → phone,  location+near_by → notes
    // ─────────────────────────────────────────────────────────────────────────
    private function migrateClients(bool $dry): void
    {
        $this->line('');
        $this->info('── Clients ────────────────────────────────────────');

        if ($this->pg()->table('clients')->count() > 0) {
            $this->warn('  Clients already exist — skipping.');

            return;
        }

        $rows = $this->legacy()->table('tbl_customer')->orderBy('customer_id')->get();
        $this->line("  Found {$rows->count()} customers in legacy.");

        $inserted = 0;
        $skipped  = 0;

        foreach ($rows as $row) {
            $locationId = $this->locationMap[$row->shop_id] ?? null;

            if (! $locationId) {
                $this->warn("  Skipping client [{$row->customer_id}] {$row->business} — shop_id {$row->shop_id} not mapped.");
                $skipped++;
                continue;
            }

            $notes = null;
            $parts = array_filter([
                $row->location ? 'Area: '.trim($row->location) : null,
                $row->near_by  ? 'Near: '.trim($row->near_by)  : null,
            ]);
            if ($parts) {
                $notes = implode('; ', $parts);
            }

            $data = [
                'location_id' => $locationId,
                'name'        => $row->business,
                'phone'       => $row->contact ?: null,
                'notes'       => $notes,
                'is_active'   => true,
                'created_at'  => $row->created_at ?? now(),
                'updated_at'  => now(),
            ];

            if ($dry) {
                $this->line("  WOULD INSERT client: {$row->business}");
                $inserted++;
            } else {
                $this->pg()->table('clients')->insertGetId($data);
                $inserted++;
            }
        }

        $this->line("  Clients: {$inserted} inserted, {$skipped} skipped.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Purchases  (tbl_batches → purchases + tbl_purchase_products → batches +
    //             purchase_items + stock_movements)
    // ─────────────────────────────────────────────────────────────────────────
    private function migratePurchases(bool $dry): void
    {
        $this->line('');
        $this->info('── Purchases ──────────────────────────────────────');

        if ($this->pg()->table('purchases')->count() > 0) {
            $this->warn('  Purchases already exist — skipping.');

            return;
        }

        // Admin user (Auck Lanaz, legacy id=8) performs all purchases
        $adminId = $this->userMap[8] ?? $this->pg()->table('users')->where('role', 'admin')->value('id');
        if (! $adminId) {
            $this->error('  Admin user not found — cannot migrate purchases.');

            return;
        }

        $legacyBatches = $this->legacy()->table('tbl_batches')->orderBy('Batch_id')->get();
        $this->line("  Found {$legacyBatches->count()} batches in legacy.");

        // Group purchase_products by batch_id for efficient lookup
        $ppByBatch = $this->legacy()
            ->table('tbl_purchase_products')
            ->orderBy('PurchaseProduct_id')
            ->get()
            ->groupBy('Batch_id');

        $purchaseCount = 0;
        $itemCount     = 0;
        $skippedBatch  = 0;
        $skippedItem   = 0;

        foreach ($legacyBatches as $batch) {
            $locationId = $this->locationMap[$batch->shop_id] ?? null;

            if (! $locationId) {
                $skippedBatch++;
                continue;
            }

            $purchaseProducts = $ppByBatch->get($batch->Batch_id, collect());
            $valid = $purchaseProducts->filter(fn ($pp) => isset($this->productMap[$pp->Item_id]));

            if ($valid->isEmpty()) {
                $skippedBatch++;
                continue;
            }

            if ($dry) {
                $this->line("  WOULD INSERT purchase batch [{$batch->Batch_id}] date={$batch->Created_date} items={$valid->count()}");
                $purchaseCount++;
                $itemCount += $valid->count();
                continue;
            }

            $purchaseId = $this->pg()->table('purchases')->insertGetId([
                'purchased_by'   => $adminId,
                'supplier_name'  => null,
                'invoice_number' => "LEGACY-B{$batch->Batch_id}",
                'purchase_date'  => $batch->Created_date,
                'notes'          => null,
                'created_at'     => $batch->Created_date ?? now(),
                'updated_at'     => now(),
            ]);
            $purchaseCount++;

            foreach ($valid as $pp) {
                $productId = $this->productMap[$pp->Item_id];

                // unit_cost: prefer Cost_Per_Price; fall back to Bulk_price ÷ Quantity
                $unitCost = (float) $pp->Cost_Per_Price;
                if ($unitCost <= 0 && $pp->Bulk_price > 0 && $pp->Quantity > 0) {
                    $unitCost = round($pp->Bulk_price / $pp->Quantity, 2);
                }

                // product batch (lot tracking)
                $batchId = $this->pg()->table('batches')->insertGetId([
                    'product_id'   => $productId,
                    'batch_number' => "LEGACY-PP{$pp->PurchaseProduct_id}",
                    'expiry_date'  => null,
                    'notes'        => null,
                    'created_at'   => $pp->Created_date ?? now(),
                    'updated_at'   => now(),
                ]);

                $purchaseItemId = $this->pg()->table('purchase_items')->insertGetId([
                    'purchase_id' => $purchaseId,
                    'product_id'  => $productId,
                    'batch_id'    => $batchId,
                    'quantity'    => $pp->Quantity,
                    'unit_cost'   => $unitCost,
                    'created_at'  => $pp->Created_date ?? now(),
                    'updated_at'  => now(),
                ]);

                $this->pg()->table('stock_movements')->insert([
                    'product_id'     => $productId,
                    'location_id'    => $locationId,
                    'movement_type'  => 'purchase',
                    'quantity'       => $pp->Quantity,  // positive = stock in
                    'reference_type' => 'App\Models\PurchaseItem',
                    'reference_id'   => $purchaseItemId,
                    'batch_id'       => $batchId,
                    'unit_cost'      => $unitCost,
                    'performed_by'   => $adminId,
                    'notes'          => null,
                    'created_at'     => $pp->Created_date ?? now(),
                ]);

                $itemCount++;
            }
        }

        $this->line("  Purchases: {$purchaseCount} inserted ({$itemCount} line items). Skipped {$skippedBatch} batches, {$skippedItem} items.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sales  (tbl_sell_products[status=ON, seller_id NOT NULL] → sales +
    //         sale_items + stock_movements)
    //   payment_method defaulted to 'nmb' (not tracked in legacy)
    //   client_id = NULL (legacy sales not linked to clients)
    // ─────────────────────────────────────────────────────────────────────────
    private function migrateSales(bool $dry): void
    {
        $this->line('');
        $this->info('── Sales ──────────────────────────────────────────');

        if ($this->pg()->table('sales')->count() > 0) {
            $this->warn('  Sales already exist — skipping.');

            return;
        }

        $rows = $this->legacy()
            ->table('tbl_sell_products')
            ->where('status', 'ON')
            ->whereNotNull('seller_id')
            ->orderBy('SellProduct_id')
            ->get();

        $this->line("  Found {$rows->count()} ON sales with seller_id in legacy.");

        // Pre-load product thresholds and costs for price_tier computation
        $thresholds = $this->pg()->table('products')->pluck('wholesale_threshold', 'id');
        $costs      = $this->pg()->table('products')->pluck('latest_cost', 'id');

        $saleCount  = 0;
        $skipped    = 0;

        foreach ($rows as $row) {
            $sellerId   = $this->userMap[$row->seller_id] ?? null;
            $locationId = $this->locationMap[$row->shop_id] ?? null;
            $productId  = $this->productMap[$row->Item_id] ?? null;

            if (! $sellerId || ! $locationId || ! $productId) {
                $skipped++;
                continue;
            }

            $threshold   = $thresholds[$productId] ?? 12;
            $priceTier   = $row->Quantity >= $threshold ? 'wholesale' : 'retail';
            $unitCost    = (float) ($costs[$productId] ?? 0);
            $totalAmount = $row->Quantity * $row->Cost_price;

            if ($dry) {
                $this->line("  WOULD INSERT sale: seller_id={$row->seller_id} item={$row->Item_id} qty={$row->Quantity} date={$row->Created_date}");
                $saleCount++;
                continue;
            }

            $saleId = $this->pg()->table('sales')->insertGetId([
                'location_id'    => $locationId,
                'sold_by'        => $sellerId,
                'client_id'      => null,
                'payment_method' => 'nmb',
                'total_amount'   => $totalAmount,
                'discount_amount'=> 0,
                'is_reverted'    => false,
                'reverted_by'    => null,
                'reverted_at'    => null,
                'revert_reason'  => null,
                'sale_date'      => $row->Created_date,
                'created_at'     => $row->Created_date ?? now(),
                'updated_at'     => now(),
            ]);

            $saleItemId = $this->pg()->table('sale_items')->insertGetId([
                'sale_id'    => $saleId,
                'product_id' => $productId,
                'batch_id'   => null,
                'quantity'   => $row->Quantity,
                'unit_price' => $row->Cost_price,
                'unit_cost'  => $unitCost,
                'price_tier' => $priceTier,
                'created_at' => $row->Created_date ?? now(),
            ]);

            $this->pg()->table('stock_movements')->insert([
                'product_id'     => $productId,
                'location_id'    => $locationId,
                'movement_type'  => 'sale',
                'quantity'       => -$row->Quantity,  // negative = stock out
                'reference_type' => 'App\Models\SaleItem',
                'reference_id'   => $saleItemId,
                'batch_id'       => null,
                'unit_cost'      => $unitCost,
                'performed_by'   => $sellerId,
                'notes'          => null,
                'created_at'     => $row->Created_date ?? now(),
            ]);

            $saleCount++;
        }

        $this->line("  Sales: {$saleCount} inserted, {$skipped} skipped (unmapped seller/location/product).");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /** PostgreSQL connection (pgsql_owner — has BYPASSRLS). */
    private function pg(): \Illuminate\Database\Connection
    {
        return DB::connection('pgsql_owner');
    }

    /** Legacy MySQL connection. */
    private function legacy(): \Illuminate\Database\Connection
    {
        return DB::connection('mysql_legacy');
    }
}
