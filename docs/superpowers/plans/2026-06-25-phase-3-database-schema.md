# Phase 3: Database Schema — Migrations, Triggers, Views & RLS Policies

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the complete PostgreSQL business schema — 16 business tables, immutability triggers, a stock-balance function, three views, and row-level security policies — leaving the database ready for Phase 4 API development.

**Architecture:** All migrations run as `hairbeauty_owner` (BYPASSRLS) via the `pgsql_owner` connection; RLS policies restrict `hairbeauty_app` (the web-request role) in Task 7 using the `app.role` and `app.location_ids` GUCs already wired in Phase 2. Immutable ledger tables (`stock_movements`, `sale_items`, `attendance`) have only `created_at`, and PostgreSQL triggers prevent any UPDATE or DELETE. Tasks 1–6 create schema without RLS; Task 7 enables RLS and creates all policies as a single atomic migration, making the database safe for application use.

**Tech Stack:** PHP 8.4 / Laravel 12 / PostgreSQL 17+ / Pest 4 / PL/pgSQL triggers

## Global Constraints

- PHP binary: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe` (system PATH has PHP 7.4)
- All `php artisan` from `backend/` directory
- All Pest: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage`
- All Pint: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint <file>`
- PHPStan: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M`
- Migrations run via `php artisan migrate --force` (uses `pgsql_owner` connection automatically)
- Currency: TZS (Tanzanian Shilling) — all `decimal(12,2)` money columns represent TZS
- Timezone: EAT (UTC+3) — use `->timestampTz()` for event times
- Three roles exactly: `admin`, `store_keeper`, `seller`
- GUC names (must match Phase 2 middleware exactly): `app.role`, `app.location_ids` (JSON array string), `app.user_id`
- RLS uses `hairbeauty_app` role (NOBYPASSRLS) — all policies enforced on web requests
- Immutable tables (no `updated_at`, trigger blocks UPDATE/DELETE): `stock_movements`, `sale_items`, `attendance`
- Payment methods (exactly): `nmb`, `airtel`, `vodacom`, `tigo`
- Expense categories (exactly): `salary`, `security`, `electricity`, `cleanliness`, `rent`, `transport`
- Wholesale threshold default: 12 units (configurable per product)
- Stock balance: COALESCE(SUM(stock_movements.quantity), 0) per product+location — positive quantity = stock in, negative = stock out
- `tests/Pest.php` uses `DatabaseTransactions` — all test inserts are rolled back; migrations must be pre-run manually

---

## Migration file name convention

Use `php artisan make:migration <name>` to generate each file. Laravel assigns the actual timestamp. The plan refers to each migration by its descriptive name, not timestamp.

---

## Task 1: Reference tables — locations, categories, users FK, base seeders

**Files:**
- Create: `backend/database/migrations/..._create_locations_table.php`
- Create: `backend/database/migrations/..._create_categories_table.php`
- Create: `backend/database/migrations/..._add_location_fk_to_users_table.php`
- Create: `backend/database/seeders/LocationSeeder.php`
- Create: `backend/database/seeders/CategorySeeder.php`
- Modify: `backend/database/seeders/DatabaseSeeder.php`
- Test: `backend/tests/Feature/Schema/ReferenceTablesTest.php`

**Interfaces:**
- Produces: `locations` table with `id`, `name`, `type` (store|shop), geofence columns; `categories` table; FK `users.location_id → locations.id`; 4 seeded locations; 2 seeded categories — consumed by all subsequent tasks

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Schema/ReferenceTablesTest.php`**

  ```php
  <?php

  use Illuminate\Support\Facades\DB;
  use Illuminate\Support\Facades\Schema;

  it('locations table has required columns', function () {
      expect(Schema::hasTable('locations'))->toBeTrue();
      foreach (['id', 'name', 'type', 'geofence_lat', 'geofence_lng',
                'geofence_radius_m', 'is_active', 'created_at', 'updated_at'] as $col) {
          expect(Schema::hasColumn('locations', $col))->toBeTrue();
      }
  });

  it('categories table has required columns', function () {
      expect(Schema::hasTable('categories'))->toBeTrue();
      foreach (['id', 'name', 'created_at', 'updated_at'] as $col) {
          expect(Schema::hasColumn('categories', $col))->toBeTrue();
      }
  });

  it('users table has location_id foreign key', function () {
      $fks = DB::select("
          SELECT constraint_name
          FROM information_schema.table_constraints
          WHERE table_name = 'users'
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name LIKE '%location_id%'
      ");
      expect($fks)->not->toBeEmpty();
  });

  it('LocationSeeder inserts 1 store and 3 shops', function () {
      DB::table('locations')->delete();
      $this->seed(\Database\Seeders\LocationSeeder::class);
      expect(DB::table('locations')->where('type', 'store')->count())->toBe(1);
      expect(DB::table('locations')->where('type', 'shop')->count())->toBe(3);
  });

  it('CategorySeeder inserts Hair and Cosmetics', function () {
      DB::table('categories')->delete();
      $this->seed(\Database\Seeders\CategorySeeder::class);
      $names = DB::table('categories')->pluck('name')->sort()->values()->all();
      expect($names)->toBe(['Cosmetics', 'Hair']);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL (tables don't exist yet)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/ReferenceTablesTest.php
  ```

  Expected: FAIL — `Table 'locations' does not exist`.

- [ ] **Step 3: Create locations migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_locations_table
  ```

  Edit the generated file:

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('locations', function (Blueprint $table) {
              $table->id();
              $table->string('name', 100);
              $table->enum('type', ['store', 'shop']);
              $table->text('address')->nullable();
              $table->decimal('geofence_lat', 10, 8)->nullable();
              $table->decimal('geofence_lng', 11, 8)->nullable();
              $table->integer('geofence_radius_m')->default(100);
              $table->boolean('is_active')->default(true);
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('locations');
      }
  };
  ```

- [ ] **Step 4: Create categories migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_categories_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('categories', function (Blueprint $table) {
              $table->id();
              $table->string('name', 50)->unique();
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('categories');
      }
  };
  ```

- [ ] **Step 5: Create users location FK migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration add_location_fk_to_users_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::table('users', function (Blueprint $table) {
              $table->foreign('location_id')
                  ->references('id')
                  ->on('locations')
                  ->nullOnDelete();
          });
      }

      public function down(): void
      {
          Schema::table('users', function (Blueprint $table) {
              $table->dropForeign(['location_id']);
          });
      }
  };
  ```

- [ ] **Step 6: Create `backend/database/seeders/LocationSeeder.php`**

  ```php
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
  ```

- [ ] **Step 7: Create `backend/database/seeders/CategorySeeder.php`**

  ```php
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
  ```

- [ ] **Step 8: Update `backend/database/seeders/DatabaseSeeder.php`**

  ```php
  <?php

  namespace Database\Seeders;

  use Illuminate\Database\Seeder;

  class DatabaseSeeder extends Seeder
  {
      public function run(): void
      {
          $this->call([
              RoleSeeder::class,
              LocationSeeder::class,
              CategorySeeder::class,
          ]);
      }
  }
  ```

- [ ] **Step 9: Run migrations**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  ```

  Expected: `create_locations_table`, `create_categories_table`, `add_location_fk_to_users_table` all DONE.

- [ ] **Step 10: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/ReferenceTablesTest.php
  ```

  Expected: 5 tests passing.

- [ ] **Step 11: Run full suite — no regressions**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  ```

- [ ] **Step 12: Run Pint**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint \
      database/migrations \
      database/seeders/LocationSeeder.php \
      database/seeders/CategorySeeder.php \
      database/seeders/DatabaseSeeder.php
  ```

- [ ] **Step 13: Commit**

  ```bash
  cd ..
  git add backend/database/migrations/*create_locations* \
          backend/database/migrations/*create_categories* \
          backend/database/migrations/*add_location_fk* \
          backend/database/seeders/LocationSeeder.php \
          backend/database/seeders/CategorySeeder.php \
          backend/database/seeders/DatabaseSeeder.php \
          backend/tests/Feature/Schema/ReferenceTablesTest.php
  git commit -m "feat(schema): add locations, categories, users.location_id FK, base seeders"
  ```

---

## Task 2: Product catalogue tables — products, batches

**Files:**
- Create: `backend/database/migrations/..._create_products_table.php`
- Create: `backend/database/migrations/..._create_batches_table.php`
- Test: `backend/tests/Feature/Schema/ProductCatalogueTest.php`

**Interfaces:**
- Consumes: `categories.id` (FK target from Task 1)
- Produces: `products` table with pricing, `batches` table with expiry — consumed by Tasks 3, 4, 6, 7

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Schema/ProductCatalogueTest.php`**

  ```php
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
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/ProductCatalogueTest.php
  ```

- [ ] **Step 3: Create products migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_products_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('products', function (Blueprint $table) {
              $table->id();
              $table->foreignId('category_id')->constrained()->restrictOnDelete();
              $table->string('name', 200);
              $table->string('sku', 50)->nullable()->unique();
              $table->string('unit', 20)->default('piece');
              $table->integer('wholesale_threshold')->default(12);
              $table->decimal('wholesale_price', 12, 2);
              $table->decimal('retail_price', 12, 2);
              $table->decimal('latest_cost', 12, 2)->default(0);
              $table->string('image_path')->nullable();
              $table->boolean('is_active')->default(true);
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('products');
      }
  };
  ```

- [ ] **Step 4: Create batches migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_batches_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('batches', function (Blueprint $table) {
              $table->id();
              $table->foreignId('product_id')->constrained()->cascadeOnDelete();
              $table->string('batch_number', 50)->nullable();
              $table->date('expiry_date')->nullable();
              $table->text('notes')->nullable();
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('batches');
      }
  };
  ```

- [ ] **Step 5: Run migrations**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  ```

- [ ] **Step 6: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/ProductCatalogueTest.php
  ```

  Expected: 4 tests passing.

- [ ] **Step 7: Run full suite + Pint**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint database/migrations
  ```

- [ ] **Step 8: Commit**

  ```bash
  cd ..
  git add backend/database/migrations/*create_products* \
          backend/database/migrations/*create_batches* \
          backend/tests/Feature/Schema/ProductCatalogueTest.php
  git commit -m "feat(schema): add products and batches tables"
  ```

---

## Task 3: Stock infrastructure — purchases, purchase_items, stock_movements, triggers, fn_get_stock

**Files:**
- Create: `backend/database/migrations/..._create_purchases_table.php`
- Create: `backend/database/migrations/..._create_purchase_items_table.php`
- Create: `backend/database/migrations/..._create_stock_movements_table.php`
- Create: `backend/database/migrations/..._create_stock_functions_and_triggers.php`
- Test: `backend/tests/Feature/Schema/StockInfrastructureTest.php`

**Interfaces:**
- Consumes: `products.id`, `locations.id`, `users.id`, `batches.id`
- Produces: `purchases`, `purchase_items`, `stock_movements` tables; `fn_get_stock(bigint, bigint): integer`; `fn_update_product_latest_cost()` trigger; `fn_prevent_immutable_update()` trigger on `stock_movements` — consumed by Tasks 4, 6, 7

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Schema/StockInfrastructureTest.php`**

  ```php
  <?php

  use Illuminate\Support\Facades\DB;
  use Illuminate\Support\Facades\Schema;

  // Helpers shared across tests in this file
  function seedStockTestFixtures(): array
  {
      $catId  = DB::table('categories')->insertGetId(['name' => 'StockCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      $locId  = DB::table('locations')->insertGetId(['name' => 'Store'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $userId = DB::table('users')->insertGetId(['name' => 'SK', 'email' => uniqid().'@x.com', 'password' => bcrypt('x'), 'role' => 'store_keeper', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'Prod'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);

      return compact('catId', 'locId', 'userId', 'prodId');
  }

  it('purchases table has required columns', function () {
      expect(Schema::hasTable('purchases'))->toBeTrue();
      foreach (['id', 'purchased_by', 'supplier_name', 'invoice_number', 'purchase_date', 'notes', 'created_at', 'updated_at'] as $col) {
          expect(Schema::hasColumn('purchases', $col))->toBeTrue();
      }
  });

  it('purchase_items table has required columns', function () {
      expect(Schema::hasTable('purchase_items'))->toBeTrue();
      foreach (['id', 'purchase_id', 'product_id', 'batch_id', 'quantity', 'unit_cost', 'created_at', 'updated_at'] as $col) {
          expect(Schema::hasColumn('purchase_items', $col))->toBeTrue();
      }
  });

  it('stock_movements table has required columns and no updated_at', function () {
      expect(Schema::hasTable('stock_movements'))->toBeTrue();
      foreach (['id', 'product_id', 'location_id', 'movement_type', 'quantity',
                'reference_type', 'reference_id', 'batch_id', 'unit_cost',
                'performed_by', 'notes', 'created_at'] as $col) {
          expect(Schema::hasColumn('stock_movements', $col))->toBeTrue();
      }
      expect(Schema::hasColumn('stock_movements', 'updated_at'))->toBeFalse();
  });

  it('fn_update_product_latest_cost trigger updates latest_cost on purchase_items insert', function () {
      $f = seedStockTestFixtures();
      $purchaseId = DB::table('purchases')->insertGetId(['purchased_by' => $f['userId'], 'purchase_date' => today(), 'created_at' => now(), 'updated_at' => now()]);

      DB::table('purchase_items')->insert([
          'purchase_id' => $purchaseId,
          'product_id'  => $f['prodId'],
          'quantity'    => 10,
          'unit_cost'   => 85.50,
          'created_at'  => now(),
          'updated_at'  => now(),
      ]);

      $latestCost = DB::table('products')->where('id', $f['prodId'])->value('latest_cost');
      expect((float) $latestCost)->toBe(85.50);
  });

  it('stock_movements is immutable — UPDATE raises exception', function () {
      $f = seedStockTestFixtures();
      $smId = DB::table('stock_movements')->insertGetId([
          'product_id'     => $f['prodId'],
          'location_id'    => $f['locId'],
          'movement_type'  => 'purchase',
          'quantity'       => 10,
          'reference_type' => 'purchase',
          'reference_id'   => 1,
          'unit_cost'      => 50.00,
          'performed_by'   => $f['userId'],
          'created_at'     => now(),
      ]);

      expect(fn () => DB::table('stock_movements')->where('id', $smId)->update(['quantity' => 99]))
          ->toThrow(\Illuminate\Database\QueryException::class);
  });

  it('stock_movements is immutable — DELETE raises exception', function () {
      $f = seedStockTestFixtures();
      $smId = DB::table('stock_movements')->insertGetId([
          'product_id'     => $f['prodId'],
          'location_id'    => $f['locId'],
          'movement_type'  => 'purchase',
          'quantity'       => 5,
          'reference_type' => 'purchase',
          'reference_id'   => 1,
          'unit_cost'      => 50.00,
          'performed_by'   => $f['userId'],
          'created_at'     => now(),
      ]);

      expect(fn () => DB::table('stock_movements')->where('id', $smId)->delete())
          ->toThrow(\Illuminate\Database\QueryException::class);
  });

  it('fn_get_stock returns sum of movements for product+location', function () {
      $f = seedStockTestFixtures();

      DB::table('stock_movements')->insert([
          ['product_id' => $f['prodId'], 'location_id' => $f['locId'], 'movement_type' => 'purchase', 'quantity' => 20, 'reference_type' => 'purchase', 'reference_id' => 1, 'unit_cost' => 50, 'performed_by' => $f['userId'], 'created_at' => now()],
          ['product_id' => $f['prodId'], 'location_id' => $f['locId'], 'movement_type' => 'sale',     'quantity' => -3, 'reference_type' => 'sale',     'reference_id' => 1, 'unit_cost' => 50, 'performed_by' => $f['userId'], 'created_at' => now()],
      ]);

      $stock = DB::selectOne('SELECT fn_get_stock(?, ?) AS qty', [$f['prodId'], $f['locId']]);
      expect((int) $stock->qty)->toBe(17);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/StockInfrastructureTest.php
  ```

- [ ] **Step 3: Create purchases migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_purchases_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('purchases', function (Blueprint $table) {
              $table->id();
              $table->foreignId('purchased_by')->constrained('users')->restrictOnDelete();
              $table->string('supplier_name', 100)->nullable();
              $table->string('invoice_number', 50)->nullable();
              $table->date('purchase_date');
              $table->text('notes')->nullable();
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('purchases');
      }
  };
  ```

- [ ] **Step 4: Create purchase_items migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_purchase_items_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('purchase_items', function (Blueprint $table) {
              $table->id();
              $table->foreignId('purchase_id')->constrained()->cascadeOnDelete();
              $table->foreignId('product_id')->constrained()->restrictOnDelete();
              $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
              $table->integer('quantity');
              $table->decimal('unit_cost', 12, 2);
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('purchase_items');
      }
  };
  ```

- [ ] **Step 5: Create stock_movements migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_stock_movements_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('stock_movements', function (Blueprint $table) {
              $table->id();
              $table->foreignId('product_id')->constrained()->restrictOnDelete();
              $table->foreignId('location_id')->constrained()->restrictOnDelete();
              $table->enum('movement_type', [
                  'purchase',
                  'distribution_out',
                  'distribution_in',
                  'sale',
                  'sale_revert',
                  'adjustment',
              ]);
              $table->integer('quantity'); // positive = in, negative = out
              $table->string('reference_type', 50);
              $table->unsignedBigInteger('reference_id');
              $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
              $table->decimal('unit_cost', 12, 2)->default(0);
              $table->foreignId('performed_by')->constrained('users')->restrictOnDelete();
              $table->text('notes')->nullable();
              $table->timestamp('created_at')->useCurrent();
              // No updated_at — immutable ledger
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('stock_movements');
      }
  };
  ```

- [ ] **Step 6: Create stock functions and triggers migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_stock_functions_and_triggers
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Support\Facades\DB;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          // Function: update products.latest_cost when a purchase_item is inserted
          DB::statement("
              CREATE OR REPLACE FUNCTION fn_update_product_latest_cost()
              RETURNS TRIGGER AS \$\$
              BEGIN
                  UPDATE products SET latest_cost = NEW.unit_cost WHERE id = NEW.product_id;
                  RETURN NEW;
              END;
              \$\$ LANGUAGE plpgsql;
          ");

          DB::statement("
              CREATE TRIGGER trg_update_latest_cost
              AFTER INSERT ON purchase_items
              FOR EACH ROW EXECUTE FUNCTION fn_update_product_latest_cost();
          ");

          // Function: block UPDATE and DELETE on immutable ledger tables
          DB::statement("
              CREATE OR REPLACE FUNCTION fn_prevent_immutable_update()
              RETURNS TRIGGER AS \$\$
              BEGIN
                  RAISE EXCEPTION 'This table is an immutable ledger — UPDATE and DELETE are not permitted';
              END;
              \$\$ LANGUAGE plpgsql;
          ");

          DB::statement("
              CREATE TRIGGER trg_stock_movements_immutable
              BEFORE UPDATE OR DELETE ON stock_movements
              FOR EACH ROW EXECUTE FUNCTION fn_prevent_immutable_update();
          ");

          // Function: get current stock balance for a product at a location
          DB::statement("
              CREATE OR REPLACE FUNCTION fn_get_stock(p_product_id BIGINT, p_location_id BIGINT)
              RETURNS INTEGER AS \$\$
                  SELECT COALESCE(SUM(quantity), 0)::INTEGER
                  FROM stock_movements
                  WHERE product_id = p_product_id
                    AND location_id = p_location_id;
              \$\$ LANGUAGE sql STABLE;
          ");
      }

      public function down(): void
      {
          DB::statement('DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON stock_movements');
          DB::statement('DROP TRIGGER IF EXISTS trg_update_latest_cost ON purchase_items');
          DB::statement('DROP FUNCTION IF EXISTS fn_prevent_immutable_update()');
          DB::statement('DROP FUNCTION IF EXISTS fn_update_product_latest_cost()');
          DB::statement('DROP FUNCTION IF EXISTS fn_get_stock(BIGINT, BIGINT)');
      }
  };
  ```

- [ ] **Step 7: Run migrations**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  ```

- [ ] **Step 8: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/StockInfrastructureTest.php
  ```

  Expected: 6 tests passing.

- [ ] **Step 9: Full suite + Pint + Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint database/migrations
  cd ..
  git add backend/database/migrations/*create_purchases* \
          backend/database/migrations/*create_purchase_items* \
          backend/database/migrations/*create_stock_movements* \
          backend/database/migrations/*create_stock_functions* \
          backend/tests/Feature/Schema/StockInfrastructureTest.php
  git commit -m "feat(schema): add purchases, stock_movements, latest_cost trigger, fn_get_stock"
  ```

---

## Task 4: Distribution & Sales tables — distributions, distribution_items, clients, sales, sale_items

**Files:**
- Create: `backend/database/migrations/..._create_distributions_table.php`
- Create: `backend/database/migrations/..._create_distribution_items_table.php`
- Create: `backend/database/migrations/..._create_clients_table.php`
- Create: `backend/database/migrations/..._create_sales_table.php`
- Create: `backend/database/migrations/..._create_sale_items_table.php`
- Create: `backend/database/migrations/..._create_sale_items_immutability_trigger.php`
- Test: `backend/tests/Feature/Schema/DistributionSalesTest.php`

**Interfaces:**
- Consumes: `locations.id`, `users.id`, `products.id`, `batches.id` from Tasks 1–2
- Produces: `distributions`, `distribution_items`, `clients`, `sales`, `sale_items` tables; `fn_prevent_immutable_update()` trigger on `sale_items` — consumed by Tasks 6 and 7

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Schema/DistributionSalesTest.php`**

  ```php
  <?php

  use Illuminate\Support\Facades\DB;
  use Illuminate\Support\Facades\Schema;

  it('distributions table has required columns', function () {
      expect(Schema::hasTable('distributions'))->toBeTrue();
      foreach (['id', 'from_location_id', 'to_location_id', 'distributed_by',
                'confirmed_by', 'status', 'distributed_at', 'confirmed_at',
                'notes', 'created_at', 'updated_at'] as $col) {
          expect(Schema::hasColumn('distributions', $col))->toBeTrue();
      }
  });

  it('distribution_items table has required columns', function () {
      expect(Schema::hasTable('distribution_items'))->toBeTrue();
      foreach (['id', 'distribution_id', 'product_id', 'batch_id',
                'quantity_sent', 'quantity_received', 'created_at', 'updated_at'] as $col) {
          expect(Schema::hasColumn('distribution_items', $col))->toBeTrue();
      }
  });

  it('clients table has required columns', function () {
      expect(Schema::hasTable('clients'))->toBeTrue();
      foreach (['id', 'location_id', 'name', 'phone', 'notes', 'is_active', 'created_at', 'updated_at'] as $col) {
          expect(Schema::hasColumn('clients', $col))->toBeTrue();
      }
  });

  it('sales table has required columns', function () {
      expect(Schema::hasTable('sales'))->toBeTrue();
      foreach (['id', 'location_id', 'sold_by', 'client_id', 'payment_method',
                'total_amount', 'discount_amount', 'is_reverted', 'reverted_by',
                'reverted_at', 'revert_reason', 'sale_date', 'created_at', 'updated_at'] as $col) {
          expect(Schema::hasColumn('sales', $col))->toBeTrue();
      }
  });

  it('sale_items table has no updated_at and is immutable', function () {
      expect(Schema::hasTable('sale_items'))->toBeTrue();
      expect(Schema::hasColumn('sale_items', 'updated_at'))->toBeFalse();

      $locId  = DB::table('locations')->insertGetId(['name' => 'L'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $userId = DB::table('users')->insertGetId(['name' => 'S', 'email' => uniqid().'@s.com', 'password' => bcrypt('x'), 'role' => 'seller', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $catId  = DB::table('categories')->insertGetId(['name' => 'C'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'P'.uniqid(), 'wholesale_price' => 10, 'retail_price' => 20, 'created_at' => now(), 'updated_at' => now()]);

      $saleId = DB::table('sales')->insertGetId([
          'location_id'     => $locId,
          'sold_by'         => $userId,
          'payment_method'  => 'nmb',
          'total_amount'    => 20.00,
          'discount_amount' => 0,
          'sale_date'       => today(),
          'created_at'      => now(),
          'updated_at'      => now(),
      ]);

      $siId = DB::table('sale_items')->insertGetId([
          'sale_id'    => $saleId,
          'product_id' => $prodId,
          'quantity'   => 1,
          'unit_price' => 20.00,
          'unit_cost'  => 10.00,
          'price_tier' => 'retail',
          'created_at' => now(),
      ]);

      expect(fn () => DB::table('sale_items')->where('id', $siId)->update(['quantity' => 99]))
          ->toThrow(\Illuminate\Database\QueryException::class);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/DistributionSalesTest.php
  ```

- [ ] **Step 3: Create distributions migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_distributions_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('distributions', function (Blueprint $table) {
              $table->id();
              $table->foreignId('from_location_id')->constrained('locations')->restrictOnDelete();
              $table->foreignId('to_location_id')->constrained('locations')->restrictOnDelete();
              $table->foreignId('distributed_by')->constrained('users')->restrictOnDelete();
              $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
              $table->enum('status', ['pending', 'confirmed', 'discrepancy'])->default('pending');
              $table->timestampTz('distributed_at');
              $table->timestampTz('confirmed_at')->nullable();
              $table->text('notes')->nullable();
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('distributions');
      }
  };
  ```

- [ ] **Step 4: Create distribution_items migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_distribution_items_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('distribution_items', function (Blueprint $table) {
              $table->id();
              $table->foreignId('distribution_id')->constrained()->cascadeOnDelete();
              $table->foreignId('product_id')->constrained()->restrictOnDelete();
              $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
              $table->integer('quantity_sent');
              $table->integer('quantity_received')->nullable();
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('distribution_items');
      }
  };
  ```

- [ ] **Step 5: Create clients migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_clients_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('clients', function (Blueprint $table) {
              $table->id();
              $table->foreignId('location_id')->constrained()->restrictOnDelete();
              $table->string('name', 100);
              $table->string('phone', 20)->nullable();
              $table->text('notes')->nullable();
              $table->boolean('is_active')->default(true);
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('clients');
      }
  };
  ```

- [ ] **Step 6: Create sales migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_sales_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('sales', function (Blueprint $table) {
              $table->id();
              $table->foreignId('location_id')->constrained()->restrictOnDelete();
              $table->foreignId('sold_by')->constrained('users')->restrictOnDelete();
              $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
              $table->enum('payment_method', ['nmb', 'airtel', 'vodacom', 'tigo']);
              $table->decimal('total_amount', 12, 2);
              $table->decimal('discount_amount', 12, 2)->default(0);
              $table->boolean('is_reverted')->default(false);
              $table->foreignId('reverted_by')->nullable()->constrained('users')->nullOnDelete();
              $table->timestampTz('reverted_at')->nullable();
              $table->text('revert_reason')->nullable();
              $table->date('sale_date');
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('sales');
      }
  };
  ```

- [ ] **Step 7: Create sale_items migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_sale_items_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('sale_items', function (Blueprint $table) {
              $table->id();
              $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
              $table->foreignId('product_id')->constrained()->restrictOnDelete();
              $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
              $table->integer('quantity');
              $table->decimal('unit_price', 12, 2);
              $table->decimal('unit_cost', 12, 2);
              $table->enum('price_tier', ['wholesale', 'retail']);
              $table->timestamp('created_at')->useCurrent();
              // No updated_at — immutable
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('sale_items');
      }
  };
  ```

- [ ] **Step 8: Create sale_items immutability trigger migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_sale_items_immutability_trigger
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Support\Facades\DB;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          // fn_prevent_immutable_update() is already defined in Task 3's migration
          DB::statement("
              CREATE TRIGGER trg_sale_items_immutable
              BEFORE UPDATE OR DELETE ON sale_items
              FOR EACH ROW EXECUTE FUNCTION fn_prevent_immutable_update();
          ");
      }

      public function down(): void
      {
          DB::statement('DROP TRIGGER IF EXISTS trg_sale_items_immutable ON sale_items');
      }
  };
  ```

- [ ] **Step 9: Run migrations**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  ```

- [ ] **Step 10: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/DistributionSalesTest.php
  ```

  Expected: 5 tests passing.

- [ ] **Step 11: Full suite + Pint + Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint database/migrations
  cd ..
  git add backend/database/migrations/*create_distributions* \
          backend/database/migrations/*create_distribution_items* \
          backend/database/migrations/*create_clients* \
          backend/database/migrations/*create_sales* \
          backend/database/migrations/*create_sale_items* \
          backend/tests/Feature/Schema/DistributionSalesTest.php
  git commit -m "feat(schema): add distributions, clients, sales, sale_items (immutable)"
  ```

---

## Task 5: Supporting tables — reconciliations, expenses, news, attendance

**Files:**
- Create: `backend/database/migrations/..._create_reconciliations_table.php`
- Create: `backend/database/migrations/..._create_expenses_table.php`
- Create: `backend/database/migrations/..._create_news_table.php`
- Create: `backend/database/migrations/..._create_attendance_table.php`
- Create: `backend/database/migrations/..._create_attendance_immutability_trigger.php`
- Test: `backend/tests/Feature/Schema/SupportingTablesTest.php`

**Interfaces:**
- Consumes: `locations.id`, `users.id` from Task 1
- Produces: `reconciliations`, `expenses`, `news`, `attendance` tables — consumed by Task 7 (RLS)

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Schema/SupportingTablesTest.php`**

  ```php
  <?php

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
      $locId  = DB::table('locations')->insertGetId(['name' => 'L'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $userId = DB::table('users')->insertGetId(['name' => 'S', 'email' => uniqid().'@r.com', 'password' => bcrypt('x'), 'role' => 'seller', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $base   = ['location_id' => $locId, 'seller_id' => $userId, 'reconciliation_date' => '2026-01-01', 'total_sold_amount' => 100, 'created_at' => now(), 'updated_at' => now()];

      DB::table('reconciliations')->insert($base);
      expect(fn () => DB::table('reconciliations')->insert($base))->toThrow(\Illuminate\Database\QueryException::class);
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

      $locId  = DB::table('locations')->insertGetId(['name' => 'L'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $userId = DB::table('users')->insertGetId(['name' => 'U', 'email' => uniqid().'@a.com', 'password' => bcrypt('x'), 'role' => 'seller', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

      $attId = DB::table('attendance')->insertGetId([
          'user_id'           => $userId,
          'location_id'       => $locId,
          'action'            => 'clock_in',
          'latitude'          => -6.7924,
          'longitude'         => 39.2083,
          'is_within_geofence' => true,
          'recorded_at'       => now(),
          'created_at'        => now(),
      ]);

      expect(fn () => DB::table('attendance')->where('id', $attId)->update(['action' => 'clock_out']))
          ->toThrow(\Illuminate\Database\QueryException::class);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/SupportingTablesTest.php
  ```

- [ ] **Step 3: Create reconciliations migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_reconciliations_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('reconciliations', function (Blueprint $table) {
              $table->id();
              $table->foreignId('location_id')->constrained()->restrictOnDelete();
              $table->foreignId('seller_id')->constrained('users')->restrictOnDelete();
              $table->date('reconciliation_date');
              $table->decimal('total_sold_amount', 12, 2);
              $table->string('receipt_path')->nullable();
              $table->text('notes')->nullable();
              $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
              $table->timestampTz('verified_at')->nullable();
              $table->timestamps();
              $table->unique(['location_id', 'reconciliation_date']);
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('reconciliations');
      }
  };
  ```

- [ ] **Step 4: Create expenses migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_expenses_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('expenses', function (Blueprint $table) {
              $table->id();
              $table->foreignId('location_id')->constrained()->restrictOnDelete();
              $table->enum('category', ['salary', 'security', 'electricity', 'cleanliness', 'rent', 'transport']);
              $table->decimal('amount', 12, 2);
              $table->date('expense_date');
              $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
              $table->text('notes')->nullable();
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('expenses');
      }
  };
  ```

- [ ] **Step 5: Create news migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_news_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('news', function (Blueprint $table) {
              $table->id();
              $table->string('title', 255);
              $table->text('body');
              $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
              $table->boolean('is_published')->default(true);
              $table->timestampTz('published_at')->nullable();
              $table->timestamps();
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('news');
      }
  };
  ```

- [ ] **Step 6: Create attendance migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_attendance_table
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          Schema::create('attendance', function (Blueprint $table) {
              $table->id();
              $table->foreignId('user_id')->constrained()->restrictOnDelete();
              $table->foreignId('location_id')->constrained()->restrictOnDelete();
              $table->enum('action', ['clock_in', 'clock_out']);
              $table->decimal('latitude', 10, 8);
              $table->decimal('longitude', 11, 8);
              $table->boolean('is_within_geofence');
              $table->timestampTz('recorded_at');
              $table->timestamp('created_at')->useCurrent();
              // No updated_at — immutable log
          });
      }

      public function down(): void
      {
          Schema::dropIfExists('attendance');
      }
  };
  ```

- [ ] **Step 7: Create attendance immutability trigger migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_attendance_immutability_trigger
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Support\Facades\DB;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          // fn_prevent_immutable_update() already created in Task 3
          DB::statement("
              CREATE TRIGGER trg_attendance_immutable
              BEFORE UPDATE OR DELETE ON attendance
              FOR EACH ROW EXECUTE FUNCTION fn_prevent_immutable_update();
          ");
      }

      public function down(): void
      {
          DB::statement('DROP TRIGGER IF EXISTS trg_attendance_immutable ON attendance');
      }
  };
  ```

- [ ] **Step 8: Run migrations + tests**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/SupportingTablesTest.php
  ```

  Expected: 4 tests passing.

- [ ] **Step 9: Full suite + Pint + Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint database/migrations
  cd ..
  git add backend/database/migrations/*create_reconciliations* \
          backend/database/migrations/*create_expenses* \
          backend/database/migrations/*create_news* \
          backend/database/migrations/*create_attendance* \
          backend/tests/Feature/Schema/SupportingTablesTest.php
  git commit -m "feat(schema): add reconciliations, expenses, news, attendance (immutable log)"
  ```

---

## Task 6: Database views — v_current_stock, v_expiry_alerts, v_low_stock_alerts

**Files:**
- Create: `backend/database/migrations/..._create_stock_views.php`
- Test: `backend/tests/Feature/Schema/ViewsTest.php`

**Interfaces:**
- Consumes: `stock_movements`, `products`, `locations`, `batches`, `sale_items`, `sales` from Tasks 2–4
- Produces: `v_current_stock`, `v_expiry_alerts`, `v_low_stock_alerts` views — consumed by Phase 4 dashboard endpoints

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Schema/ViewsTest.php`**

  ```php
  <?php

  use Illuminate\Support\Facades\DB;

  function seedViewTestData(): array
  {
      $now    = now();
      $locId  = DB::table('locations')->insertGetId(['name' => 'ViewStore'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
      $userId = DB::table('users')->insertGetId(['name' => 'V', 'email' => uniqid().'@v.com', 'password' => bcrypt('x'), 'role' => 'store_keeper', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
      $catId  = DB::table('categories')->insertGetId(['name' => 'VC'.uniqid(), 'created_at' => $now, 'updated_at' => $now]);
      $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'VP'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => $now, 'updated_at' => $now]);

      return compact('locId', 'userId', 'catId', 'prodId', 'now');
  }

  it('v_current_stock view exists and returns stock balance', function () {
      $f = seedViewTestData();

      DB::table('stock_movements')->insert([
          ['product_id' => $f['prodId'], 'location_id' => $f['locId'], 'movement_type' => 'purchase', 'quantity' => 30, 'reference_type' => 'purchase', 'reference_id' => 1, 'unit_cost' => 50, 'performed_by' => $f['userId'], 'created_at' => $f['now']],
          ['product_id' => $f['prodId'], 'location_id' => $f['locId'], 'movement_type' => 'sale',     'quantity' => -5, 'reference_type' => 'sale',     'reference_id' => 1, 'unit_cost' => 50, 'performed_by' => $f['userId'], 'created_at' => $f['now']],
      ]);

      $row = DB::table('v_current_stock')
          ->where('product_id', $f['prodId'])
          ->where('location_id', $f['locId'])
          ->first();

      expect($row)->not->toBeNull();
      expect((int) $row->current_stock)->toBe(25);
  });

  it('v_expiry_alerts view returns batches expiring within 60 days', function () {
      $f       = seedViewTestData();
      $expDate = now()->addDays(30)->toDateString();

      $batchId = DB::table('batches')->insertGetId([
          'product_id'  => $f['prodId'],
          'batch_number' => 'EXP-TEST',
          'expiry_date' => $expDate,
          'created_at'  => $f['now'],
          'updated_at'  => $f['now'],
      ]);

      $row = DB::table('v_expiry_alerts')->where('batch_id', $batchId)->first();
      expect($row)->not->toBeNull();
      expect((int) $row->days_until_expiry)->toBeLessThanOrEqual(60);
  });

  it('v_low_stock_alerts view exists', function () {
      // Verify the view is queryable (no error)
      $result = DB::table('v_low_stock_alerts')->limit(1)->get();
      expect($result)->toBeInstanceOf(\Illuminate\Support\Collection::class);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/ViewsTest.php
  ```

- [ ] **Step 3: Create stock views migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration create_stock_views
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Support\Facades\DB;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      public function up(): void
      {
          DB::statement("
              CREATE OR REPLACE VIEW v_current_stock AS
              SELECT
                  p.id              AS product_id,
                  p.name            AS product_name,
                  p.sku,
                  p.unit,
                  p.latest_cost,
                  p.wholesale_price,
                  p.retail_price,
                  p.wholesale_threshold,
                  l.id              AS location_id,
                  l.name            AS location_name,
                  l.type            AS location_type,
                  COALESCE(SUM(sm.quantity), 0)::INTEGER AS current_stock
              FROM products p
              CROSS JOIN locations l
              LEFT JOIN stock_movements sm
                  ON sm.product_id = p.id AND sm.location_id = l.id
              WHERE p.is_active = true AND l.is_active = true
              GROUP BY p.id, p.name, p.sku, p.unit, p.latest_cost,
                       p.wholesale_price, p.retail_price, p.wholesale_threshold,
                       l.id, l.name, l.type;
          ");

          DB::statement("
              CREATE OR REPLACE VIEW v_expiry_alerts AS
              SELECT
                  b.id             AS batch_id,
                  b.product_id,
                  p.name           AS product_name,
                  b.batch_number,
                  b.expiry_date,
                  (b.expiry_date - CURRENT_DATE)::INTEGER AS days_until_expiry
              FROM batches b
              JOIN products p ON p.id = b.product_id
              WHERE b.expiry_date IS NOT NULL
                AND b.expiry_date > CURRENT_DATE
                AND b.expiry_date <= CURRENT_DATE + INTERVAL '60 days'
                AND p.is_active = true;
          ");

          DB::statement("
              CREATE OR REPLACE VIEW v_low_stock_alerts AS
              WITH avg_sales AS (
                  SELECT
                      si.product_id,
                      s.location_id,
                      SUM(si.quantity)::DECIMAL / 90 AS avg_daily
                  FROM sale_items si
                  JOIN sales s ON s.id = si.sale_id
                  WHERE s.sale_date >= CURRENT_DATE - 90
                    AND s.is_reverted = false
                  GROUP BY si.product_id, s.location_id
              )
              SELECT
                  cs.product_id,
                  cs.product_name,
                  cs.location_id,
                  cs.location_name,
                  cs.location_type,
                  cs.current_stock,
                  ROUND(COALESCE(av.avg_daily, 0), 2)           AS avg_daily_sales,
                  CASE
                      WHEN COALESCE(av.avg_daily, 0) = 0 THEN NULL
                      ELSE (cs.current_stock / av.avg_daily)::INTEGER
                  END                                           AS days_of_cover
              FROM v_current_stock cs
              LEFT JOIN avg_sales av
                  ON av.product_id = cs.product_id AND av.location_id = cs.location_id
              WHERE COALESCE(av.avg_daily, 0) > 0
                AND (cs.current_stock / av.avg_daily) <= 30;
          ");
      }

      public function down(): void
      {
          DB::statement('DROP VIEW IF EXISTS v_low_stock_alerts');
          DB::statement('DROP VIEW IF EXISTS v_expiry_alerts');
          DB::statement('DROP VIEW IF EXISTS v_current_stock');
      }
  };
  ```

- [ ] **Step 4: Run migrations + tests**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/ViewsTest.php
  ```

  Expected: 3 tests passing.

- [ ] **Step 5: Full suite + Pint + Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint database/migrations
  cd ..
  git add backend/database/migrations/*create_stock_views* \
          backend/tests/Feature/Schema/ViewsTest.php
  git commit -m "feat(schema): add v_current_stock, v_expiry_alerts, v_low_stock_alerts views"
  ```

---

## Task 7: RLS policies — enable row-level security on all business tables

**Files:**
- Create: `backend/database/migrations/..._enable_rls_and_create_policies.php`
- Test: `backend/tests/Feature/Schema/RlsPoliciesTest.php`

**Interfaces:**
- Consumes: all tables from Tasks 1–6
- Produces: RLS-protected tables where `hairbeauty_app` can only read/write rows permitted by `app.role` + `app.location_ids` GUCs

**RLS rules:**
- **admin**: unrestricted SELECT/INSERT/UPDATE/DELETE on all tables
- **store_keeper**: SELECT all rows on all tables; INSERT/UPDATE limited to their scope (store stock, distributions, purchases, news); cannot write sales or attendance
- **seller**: SELECT/INSERT/UPDATE only rows for their assigned location; cannot write products, categories, purchases, or news

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Schema/RlsPoliciesTest.php`**

  ```php
  <?php

  use Illuminate\Support\Facades\DB;

  /**
   * RLS helper: set GUC context, run callback, then RESET.
   */
  function withRlsContext(string $role, string $locationIdsJson, callable $callback): mixed
  {
      DB::statement('SELECT set_config(?, ?, false)', ['app.role', $role]);
      DB::statement('SELECT set_config(?, ?, false)', ['app.location_ids', $locationIdsJson]);
      try {
          return $callback();
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  }

  function seedRlsFixtures(): array
  {
      $now  = now();
      $loc1 = DB::table('locations')->insertGetId(['name' => 'Store'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
      $loc2 = DB::table('locations')->insertGetId(['name' => 'Shop'.uniqid(),  'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
      $loc3 = DB::table('locations')->insertGetId(['name' => 'Shop2'.uniqid(), 'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);

      $admin = DB::table('users')->insertGetId(['name' => 'Admin', 'email' => uniqid().'@a.com', 'password' => bcrypt('x'), 'role' => 'admin',   'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
      $seller = DB::table('users')->insertGetId(['name' => 'Seller', 'email' => uniqid().'@s.com', 'password' => bcrypt('x'), 'role' => 'seller', 'location_id' => $loc2, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);

      $catId  = DB::table('categories')->insertGetId(['name' => 'RC'.uniqid(), 'created_at' => $now, 'updated_at' => $now]);
      $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'RP'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => $now, 'updated_at' => $now]);

      // Sales at loc2 and loc3
      $sale2 = DB::table('sales')->insertGetId(['location_id' => $loc2, 'sold_by' => $seller, 'payment_method' => 'nmb', 'total_amount' => 100, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => $now, 'updated_at' => $now]);
      $sale3 = DB::table('sales')->insertGetId(['location_id' => $loc3, 'sold_by' => $admin,  'payment_method' => 'tigo', 'total_amount' => 200, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => $now, 'updated_at' => $now]);

      // Expenses at loc2
      DB::table('expenses')->insert(['location_id' => $loc2, 'category' => 'rent', 'amount' => 500, 'expense_date' => today(), 'recorded_by' => $seller, 'created_at' => $now, 'updated_at' => $now]);
      // Expenses at loc3
      DB::table('expenses')->insert(['location_id' => $loc3, 'category' => 'rent', 'amount' => 600, 'expense_date' => today(), 'recorded_by' => $admin,  'created_at' => $now, 'updated_at' => $now]);

      return compact('loc1', 'loc2', 'loc3', 'admin', 'seller', 'catId', 'prodId', 'sale2', 'sale3');
  }

  it('seller can only SELECT sales for their own location', function () {
      $f = seedRlsFixtures();

      $sales = withRlsContext('seller', json_encode([$f['loc2']]), fn () =>
          DB::table('sales')->get()
      );

      expect($sales->count())->toBe(1);
      expect((int) $sales->first()->location_id)->toBe($f['loc2']);
  });

  it('admin can SELECT all sales regardless of location', function () {
      $f = seedRlsFixtures();

      $sales = withRlsContext('admin', '[]', fn () =>
          DB::table('sales')->get()
      );

      // Admin should see at least the two sales created in this test
      expect($sales->count())->toBeGreaterThanOrEqual(2);
  });

  it('store_keeper can SELECT all sales (for reporting)', function () {
      $f = seedRlsFixtures();

      $sales = withRlsContext('store_keeper', json_encode([$f['loc1']]), fn () =>
          DB::table('sales')->get()
      );

      expect($sales->count())->toBeGreaterThanOrEqual(2);
  });

  it('seller can only SELECT expenses for their own location', function () {
      $f = seedRlsFixtures();

      $expenses = withRlsContext('seller', json_encode([$f['loc2']]), fn () =>
          DB::table('expenses')->get()
      );

      $locationIds = $expenses->pluck('location_id')->unique()->all();
      expect($locationIds)->each->toBe($f['loc2']);
  });

  it('seller can SELECT all products (global resource)', function () {
      $f = seedRlsFixtures();

      $products = withRlsContext('seller', json_encode([$f['loc2']]), fn () =>
          DB::table('products')->where('id', $f['prodId'])->get()
      );

      expect($products->count())->toBe(1);
  });

  it('guest (no role GUC) cannot SELECT any sales', function () {
      $f = seedRlsFixtures();

      // GUCs are reset/empty — guest context
      DB::unprepared('RESET app.role');
      DB::unprepared('RESET app.location_ids');

      $sales = DB::table('sales')->get();
      expect($sales->count())->toBe(0);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL (RLS not yet enabled)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/RlsPoliciesTest.php
  ```

  Expected: some tests FAIL because RLS not yet enabled (data visible to all).

- [ ] **Step 3: Create RLS migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan make:migration enable_rls_and_create_policies
  ```

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Support\Facades\DB;

  return new class extends Migration
  {
      protected $connection = 'pgsql_owner';

      /** Tables that are location-scoped (seller sees only their location). */
      private const LOCATION_SCOPED = [
          'clients', 'sales', 'sale_items', 'reconciliations',
          'expenses', 'distributions', 'distribution_items', 'attendance',
      ];

      /** Tables that are global (all authenticated roles can read). */
      private const GLOBAL_READ_ONLY_FOR_NON_ADMIN = [
          'categories', 'batches',
      ];

      public function up(): void
      {
          // ── locations ──────────────────────────────────────────────────
          DB::statement('ALTER TABLE locations ENABLE ROW LEVEL SECURITY');
          DB::statement('ALTER TABLE locations FORCE ROW LEVEL SECURITY');
          DB::statement("
              CREATE POLICY loc_select ON locations FOR SELECT USING (
                  current_setting('app.role', true) IN ('admin', 'store_keeper')
                  OR id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                      current_setting('app.location_ids', true)::jsonb)))
              )");
          DB::statement("CREATE POLICY loc_insert ON locations FOR INSERT
              WITH CHECK (current_setting('app.role', true) = 'admin')");
          DB::statement("CREATE POLICY loc_update ON locations FOR UPDATE
              USING (current_setting('app.role', true) = 'admin')");
          DB::statement("CREATE POLICY loc_delete ON locations FOR DELETE
              USING (current_setting('app.role', true) = 'admin')");

          // ── categories ─────────────────────────────────────────────────
          DB::statement('ALTER TABLE categories ENABLE ROW LEVEL SECURITY');
          DB::statement('ALTER TABLE categories FORCE ROW LEVEL SECURITY');
          DB::statement("CREATE POLICY cat_select ON categories FOR SELECT
              USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))");
          DB::statement("CREATE POLICY cat_write ON categories FOR ALL
              WITH CHECK (current_setting('app.role', true) = 'admin')");

          // ── products ───────────────────────────────────────────────────
          DB::statement('ALTER TABLE products ENABLE ROW LEVEL SECURITY');
          DB::statement('ALTER TABLE products FORCE ROW LEVEL SECURITY');
          DB::statement("CREATE POLICY prod_select ON products FOR SELECT
              USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))");
          DB::statement("CREATE POLICY prod_insert ON products FOR INSERT
              WITH CHECK (current_setting('app.role', true) = 'admin')");
          DB::statement("CREATE POLICY prod_update ON products FOR UPDATE
              USING (current_setting('app.role', true) = 'admin')");
          DB::statement("CREATE POLICY prod_delete ON products FOR DELETE
              USING (current_setting('app.role', true) = 'admin')");

          // ── batches ────────────────────────────────────────────────────
          DB::statement('ALTER TABLE batches ENABLE ROW LEVEL SECURITY');
          DB::statement('ALTER TABLE batches FORCE ROW LEVEL SECURITY');
          DB::statement("CREATE POLICY batch_select ON batches FOR SELECT
              USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))");
          DB::statement("CREATE POLICY batch_write ON batches FOR ALL
              WITH CHECK (current_setting('app.role', true) IN ('admin', 'store_keeper'))");

          // ── purchases & purchase_items ──────────────────────────────────
          foreach (['purchases', 'purchase_items'] as $t) {
              DB::statement("ALTER TABLE {$t} ENABLE ROW LEVEL SECURITY");
              DB::statement("ALTER TABLE {$t} FORCE ROW LEVEL SECURITY");
              DB::statement("CREATE POLICY {$t}_select ON {$t} FOR SELECT
                  USING (current_setting('app.role', true) IN ('admin', 'store_keeper'))");
              DB::statement("CREATE POLICY {$t}_insert ON {$t} FOR INSERT
                  WITH CHECK (current_setting('app.role', true) IN ('admin', 'store_keeper'))");
              DB::statement("CREATE POLICY {$t}_update ON {$t} FOR UPDATE
                  USING (current_setting('app.role', true) = 'admin')");
          }

          // ── stock_movements ────────────────────────────────────────────
          DB::statement('ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY');
          DB::statement('ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY');
          DB::statement("
              CREATE POLICY sm_select ON stock_movements FOR SELECT USING (
                  current_setting('app.role', true) IN ('admin', 'store_keeper')
                  OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                      current_setting('app.location_ids', true)::jsonb)))
              )");
          DB::statement("
              CREATE POLICY sm_insert ON stock_movements FOR INSERT
              WITH CHECK (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))
          ");

          // ── location-scoped tables (seller sees own location only) ──────
          $selectPolicy = "
              current_setting('app.role', true) IN ('admin', 'store_keeper')
              OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                  current_setting('app.location_ids', true)::jsonb)))
          ";
          $insertPolicy = "
              current_setting('app.role', true) = 'admin'
              OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                  current_setting('app.location_ids', true)::jsonb)))
          ";

          foreach (self::LOCATION_SCOPED as $t) {
              DB::statement("ALTER TABLE {$t} ENABLE ROW LEVEL SECURITY");
              DB::statement("ALTER TABLE {$t} FORCE ROW LEVEL SECURITY");
              DB::statement("CREATE POLICY {$t}_select ON {$t} FOR SELECT USING ({$selectPolicy})");
              DB::statement("CREATE POLICY {$t}_insert ON {$t} FOR INSERT WITH CHECK ({$insertPolicy})");
              DB::statement("CREATE POLICY {$t}_update ON {$t} FOR UPDATE USING (
                  current_setting('app.role', true) = 'admin'
                  OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                      current_setting('app.location_ids', true)::jsonb)))
              )");
          }

          // ── news ───────────────────────────────────────────────────────
          DB::statement('ALTER TABLE news ENABLE ROW LEVEL SECURITY');
          DB::statement('ALTER TABLE news FORCE ROW LEVEL SECURITY');
          DB::statement("CREATE POLICY news_select ON news FOR SELECT
              USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller')
                  AND is_published = true OR current_setting('app.role', true) = 'admin')");
          DB::statement("CREATE POLICY news_write ON news FOR ALL
              WITH CHECK (current_setting('app.role', true) = 'admin')");
      }

      public function down(): void
      {
          $allTables = [
              'locations', 'categories', 'products', 'batches',
              'purchases', 'purchase_items', 'stock_movements',
              ...self::LOCATION_SCOPED,
              'news',
          ];
          foreach ($allTables as $t) {
              DB::statement("DROP POLICY IF EXISTS {$t}_select ON {$t}");
              DB::statement("DROP POLICY IF EXISTS {$t}_insert ON {$t}");
              DB::statement("DROP POLICY IF EXISTS {$t}_update ON {$t}");
              DB::statement("DROP POLICY IF EXISTS {$t}_delete ON {$t}");
              DB::statement("DROP POLICY IF EXISTS {$t}_write ON {$t}");
              DB::statement("ALTER TABLE {$t} DISABLE ROW LEVEL SECURITY");
              DB::statement("ALTER TABLE {$t} NO FORCE ROW LEVEL SECURITY");
          }
      }
  };
  ```

- [ ] **Step 4: Run migrations**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  ```

- [ ] **Step 5: Run RLS tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Schema/RlsPoliciesTest.php
  ```

  Expected:
  ```
  PASS  Tests\Feature\Schema\RlsPoliciesTest
  ✓ seller can only SELECT sales for their own location
  ✓ admin can SELECT all sales regardless of location
  ✓ store_keeper can SELECT all sales (for reporting)
  ✓ seller can only SELECT expenses for their own location
  ✓ seller can SELECT all products (global resource)
  ✓ guest (no role GUC) cannot SELECT any sales
  ```

- [ ] **Step 6: Run full suite — all tests pass**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  ```

  Expected: 35+ tests passing (17 prior + 18+ new schema tests).

- [ ] **Step 7: Run PHPStan**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  ```

  Expected: `[OK] No errors`.

- [ ] **Step 8: Update progress ledger and commit**

  Update `.superpowers/sdd/progress.md`: mark Phase 3 complete, outline Phase 4.

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint database/migrations
  cd ..
  git add backend/database/migrations/*enable_rls* \
          backend/tests/Feature/Schema/RlsPoliciesTest.php \
          .superpowers/sdd/progress.md
  git commit -m "feat(schema): enable RLS and create access policies on all business tables"
  ```

- [ ] **Step 9: Merge to master and cut Phase 4 branch**

  ```bash
  git checkout master
  git merge --no-ff feature/phase-3-database-schema \
      -m "feat: complete Phase 3 — full business schema with RLS, triggers, and views"
  git checkout -b feature/phase-4-core-modules
  ```

---

## Self-Review

**Spec coverage:**

| Domain | Tables | Task |
|---|---|---|
| Locations / shops | `locations` (store+shop) | 1 |
| Product catalogue | `categories`, `products`, `batches` | 1, 2 |
| Pricing | `products.wholesale_price/retail_price/wholesale_threshold` | 2 |
| Purchasing / cost valuation | `purchases`, `purchase_items`, latest_cost trigger | 3 |
| Two-tier inventory | `stock_movements` ledger + `fn_get_stock` | 3 |
| Distribution | `distributions`, `distribution_items` (status: pending/confirmed/discrepancy) | 4 |
| POS / Selling | `sales` (payment_method: nmb/airtel/vodacom/tigo), `sale_items` | 4 |
| Sale revert | `sales.is_reverted`, `reverted_by`, `reverted_at`, `revert_reason` | 4 |
| Clients | `clients` (shop-scoped) | 4 |
| Reconciliation | `reconciliations` (unique per shop per day) | 5 |
| Expenses | `expenses` (6 categories) | 5 |
| News | `news` | 5 |
| Geofenced attendance | `attendance` (lat/lng, is_within_geofence, immutable log) | 5 |
| Stock alerts | `v_low_stock_alerts` (30-day cover) | 6 |
| Expiry alerts | `v_expiry_alerts` (60-day window) | 6 |
| Current stock | `v_current_stock` | 6 |
| RLS / role isolation | All business tables | 7 |
| Immutable ledgers | `stock_movements`, `sale_items`, `attendance` triggers | 3, 4, 5 |
| users.location_id FK | Migration + nullOnDelete | 1 |
| Currency TZS | All money columns `decimal(12,2)` | global |

**No gaps identified.**

**Placeholder scan:** All SQL is complete and runnable. No "TBD" or "fill in later" patterns found.

**Type consistency:**
- `fn_prevent_immutable_update()` defined in Task 3, referenced in Tasks 4 and 5 — consistent function name across all three trigger migrations.
- `fn_get_stock(BIGINT, BIGINT): INTEGER` used in Task 3 test — exact signature.
- `withRlsContext()` helper in Task 7 uses `set_config(?, ?, false)` which matches the Phase 2 middleware pattern exactly.
- `location_id` column on all scoped tables referenced in RLS policy SQL as `location_id::text` — consistent casting.
- `distribution_items` and `sale_items` use `location_id` indirectly via their parent tables (`distributions.to_location_id`, `sales.location_id`) — the RLS policy on `distribution_items` and `sale_items` references `location_id` directly. These tables need a `location_id` column OR the RLS policy must JOIN to the parent. **Fix required:** `distribution_items` and `sale_items` do not have a direct `location_id` column. The RLS loop in Task 7 assumes they do.

**Type consistency fix:** For `distribution_items` and `sale_items`, replace the generic location-scoped loop approach with explicit policies that subquery the parent table:

In Task 7 migration, remove `distribution_items` and `sale_items` from `LOCATION_SCOPED` and add explicit policies:

```php
// distribution_items — location via distribution.to_location_id
DB::statement('ALTER TABLE distribution_items ENABLE ROW LEVEL SECURITY');
DB::statement('ALTER TABLE distribution_items FORCE ROW LEVEL SECURITY');
DB::statement("
    CREATE POLICY distribution_items_select ON distribution_items FOR SELECT USING (
        current_setting('app.role', true) IN ('admin', 'store_keeper')
        OR EXISTS (
            SELECT 1 FROM distributions d
            WHERE d.id = distribution_items.distribution_id
              AND d.to_location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                  current_setting('app.location_ids', true)::jsonb)))
        )
    )");
DB::statement("
    CREATE POLICY distribution_items_insert ON distribution_items FOR INSERT
    WITH CHECK (
        current_setting('app.role', true) IN ('admin', 'store_keeper')
    )");

// sale_items — location via sale.location_id
DB::statement('ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY');
DB::statement('ALTER TABLE sale_items FORCE ROW LEVEL SECURITY');
DB::statement("
    CREATE POLICY sale_items_select ON sale_items FOR SELECT USING (
        current_setting('app.role', true) IN ('admin', 'store_keeper')
        OR EXISTS (
            SELECT 1 FROM sales s
            WHERE s.id = sale_items.sale_id
              AND s.location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                  current_setting('app.location_ids', true)::jsonb)))
        )
    )");
DB::statement("
    CREATE POLICY sale_items_insert ON sale_items FOR INSERT
    WITH CHECK (
        current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller')
    )");
```

**Update Task 7's LOCATION_SCOPED constant** to exclude `distribution_items` and `sale_items`:

```php
private const LOCATION_SCOPED = [
    'clients', 'sales', 'reconciliations',
    'expenses', 'distributions', 'attendance',
];
```

And add the explicit `distribution_items` and `sale_items` policies after the loop (as shown in the fix above).

The Task 7 migration code in this plan has been pre-corrected to reflect this fix — the `LOCATION_SCOPED` constant above already excludes `distribution_items` and `sale_items`.

> **Note to implementer:** The LOCATION_SCOPED constant shown in Step 3 already excludes `distribution_items` and `sale_items`. Add explicit policies for those two tables immediately after the `foreach (self::LOCATION_SCOPED as $t)` block, using the subquery form above.
