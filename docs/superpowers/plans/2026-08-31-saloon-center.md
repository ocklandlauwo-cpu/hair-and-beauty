# Saloon Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Saloon Center" business line — providers, a service catalog, logged service sales, a capital-tools ledger, and a matching dashboard section — alongside the existing shop/store retail operation.

**Architecture:** Four new Postgres tables (`providers`, `saloon_services`, `saloon_sales`, `saloon_tools`) plus a `business_line` column on the existing `expenses` table, each following this codebase's established Laravel + RLS + Eloquent conventions exactly (mirrors `ClientController`/`CategoryController`/`ProductController`/`SaleController` and the existing RLS migration pattern). Frontend follows the existing tab/CRUD-modal/`DataTable` conventions used by `ClientsPage.tsx`/`CategoriesPage.tsx`/`SalesPage.tsx`.

**Tech Stack:** Laravel 11 (PHP) on PostgreSQL with row-level security, Pest for backend tests; React + TypeScript, TanStack Query, react-hook-form + zod, Vitest + Testing Library for frontend tests.

**Spec:** `docs/superpowers/specs/2026-08-31-saloon-center-design.md`

## Global Constraints

- Saloon services happen at existing shop locations (`locations.type = 'shop'`) — no new location type.
- Providers are **not** shop-scoped — selectable at any shop.
- Services catalog (`saloon_services`) is admin-manageable, not hardcoded.
- Profit = `amount × 0.75` (flat assumed margin), computed at read time — never stored.
- Saloon Tools is an **add-only ledger** — no edit/delete, no low-stock/expiry tracking. Admin-only, both read and write.
- `expenses.business_line` (`'shop' | 'saloon'`, default `'shop'`) distinguishes Store vs. Saloon Center expenses. Existing rows are unaffected (default `'shop'`).
- No revert for a logged saloon sale. No notes/photo field on a saloon sale.
- Roles: view Saloon Center list / Providers / Saloon Services = admin, store_keeper, seller. Log a saloon sale = admin, seller (seller auto-scoped to own shop). Manage Providers/Saloon Services (add/edit/delete) = admin only. View or log a Saloon Tool purchase = admin only.
- All new `store` endpoints for transactional data (`saloon-sales`, `saloon-tools`) get the `no-dups` idempotency middleware, matching every other create endpoint in `backend/routes/api.php`.
- Migrations use `protected $connection = 'pgsql_owner';`, matching every existing migration in `backend/database/migrations/`.

---

### Task 1: Migrations — new tables + `expenses.business_line`

**Files:**
- Create: `backend/database/migrations/2026_08_31_090000_create_providers_table.php`
- Create: `backend/database/migrations/2026_08_31_090100_create_saloon_services_table.php`
- Create: `backend/database/migrations/2026_08_31_090200_create_saloon_sales_table.php`
- Create: `backend/database/migrations/2026_08_31_090300_create_saloon_tools_table.php`
- Create: `backend/database/migrations/2026_08_31_090400_add_business_line_to_expenses_table.php`
- Test: `backend/tests/Feature/Schema/SaloonCenterSchemaTest.php`

**Interfaces:**
- Produces: tables `providers (id, name, phone, is_active, created_at, updated_at)`, `saloon_services (id, name, is_active, created_at, updated_at)`, `saloon_sales (id, location_id, provider_id, saloon_service_id, amount, sale_date, created_by, created_at, updated_at)`, `saloon_tools (id, location_id, name, quantity, unit_cost, purchase_date, recorded_by, created_at, updated_at)`, and `expenses.business_line` (enum `shop`/`saloon`, default `shop`). Every later backend task in this plan reads/writes these tables via Eloquent models built in Tasks 3-5.

- [ ] **Step 1: Write the failing schema test**

```php
<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

it('providers table has all required columns', function () {
    expect(Schema::hasTable('providers'))->toBeTrue();
    foreach (['id', 'name', 'phone', 'is_active', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('providers', $col))->toBeTrue();
    }
});

it('saloon_services table has all required columns', function () {
    expect(Schema::hasTable('saloon_services'))->toBeTrue();
    foreach (['id', 'name', 'is_active', 'created_at', 'updated_at'] as $col) {
        expect(Schema::hasColumn('saloon_services', $col))->toBeTrue();
    }
});

it('saloon_sales table has all required columns', function () {
    expect(Schema::hasTable('saloon_sales'))->toBeTrue();
    foreach ([
        'id', 'location_id', 'provider_id', 'saloon_service_id',
        'amount', 'sale_date', 'created_by', 'created_at', 'updated_at',
    ] as $col) {
        expect(Schema::hasColumn('saloon_sales', $col))->toBeTrue();
    }
});

it('saloon_tools table has all required columns', function () {
    expect(Schema::hasTable('saloon_tools'))->toBeTrue();
    foreach ([
        'id', 'location_id', 'name', 'quantity', 'unit_cost',
        'purchase_date', 'recorded_by', 'created_at', 'updated_at',
    ] as $col) {
        expect(Schema::hasColumn('saloon_tools', $col))->toBeTrue();
    }
});

it('expenses.business_line defaults to shop', function () {
    expect(Schema::hasColumn('expenses', 'business_line'))->toBeTrue();

    $shopId = DB::table('locations')->insertGetId(['name' => 'BLShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $userId = DB::table('users')->insertGetId(['name' => 'BLUser', 'email' => 'bluser'.uniqid().'@test.com', 'password' => 'x', 'role' => 'admin', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

    $id = DB::table('expenses')->insertGetId([
        'location_id' => $shopId, 'category' => 'rent', 'amount' => 1000,
        'expense_date' => today(), 'recorded_by' => $userId,
        'created_at' => now(), 'updated_at' => now(),
    ]);

    expect(DB::table('expenses')->find($id)->business_line)->toBe('shop');
});

it('saloon_tools asset value is quantity times unit_cost', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'ToolShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $userId = DB::table('users')->insertGetId(['name' => 'ToolUser', 'email' => 'tooluser'.uniqid().'@test.com', 'password' => 'x', 'role' => 'admin', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

    $id = DB::table('saloon_tools')->insertGetId([
        'location_id' => $shopId, 'name' => 'Hair Dryer', 'quantity' => 3, 'unit_cost' => 50000,
        'purchase_date' => today(), 'recorded_by' => $userId,
        'created_at' => now(), 'updated_at' => now(),
    ]);

    $row = DB::table('saloon_tools')->find($id);
    expect((int) $row->quantity * (float) $row->unit_cost)->toBe(150000.0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && php artisan test tests/Feature/Schema/SaloonCenterSchemaTest.php`
Expected: FAIL — none of the tables/columns exist yet.

- [ ] **Step 3: Write the migrations**

`2026_08_31_090000_create_providers_table.php`:
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
        Schema::create('providers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('phone', 20)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('providers');
    }
};
```

`2026_08_31_090100_create_saloon_services_table.php`:
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
        Schema::create('saloon_services', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saloon_services');
    }
};
```

`2026_08_31_090200_create_saloon_sales_table.php`:
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
        Schema::create('saloon_sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('location_id')->constrained()->restrictOnDelete();
            $table->foreignId('provider_id')->constrained()->restrictOnDelete();
            $table->foreignId('saloon_service_id')->constrained()->restrictOnDelete();
            $table->decimal('amount', 12, 2);
            $table->date('sale_date');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saloon_sales');
    }
};
```

`2026_08_31_090300_create_saloon_tools_table.php`:
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
        Schema::create('saloon_tools', function (Blueprint $table) {
            $table->id();
            $table->foreignId('location_id')->constrained()->restrictOnDelete();
            $table->string('name', 150);
            $table->integer('quantity');
            $table->decimal('unit_cost', 12, 2);
            $table->date('purchase_date');
            $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saloon_tools');
    }
};
```

`2026_08_31_090400_add_business_line_to_expenses_table.php`:
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
        Schema::table('expenses', function (Blueprint $table) {
            $table->enum('business_line', ['shop', 'saloon'])->default('shop');
        });
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropColumn('business_line');
        });
    }
};
```

- [ ] **Step 4: Run the migrations**

Run: `cd backend && "/c/laragon/bin/php/php-8.4.12-nts-Win32-vs17-x64/php.exe" artisan migrate`
Expected: all 5 migrations run successfully.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && php artisan test tests/Feature/Schema/SaloonCenterSchemaTest.php`
Expected: PASS (all 6 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/database/migrations/2026_08_31_090000_create_providers_table.php \
        backend/database/migrations/2026_08_31_090100_create_saloon_services_table.php \
        backend/database/migrations/2026_08_31_090200_create_saloon_sales_table.php \
        backend/database/migrations/2026_08_31_090300_create_saloon_tools_table.php \
        backend/database/migrations/2026_08_31_090400_add_business_line_to_expenses_table.php \
        backend/tests/Feature/Schema/SaloonCenterSchemaTest.php
git commit -m "feat(saloon-center): add providers, saloon_services, saloon_sales, saloon_tools tables and expenses.business_line"
```

---

### Task 2: RLS policies for the new tables

**Files:**
- Create: `backend/database/migrations/2026_08_31_090500_enable_rls_for_saloon_center.php`
- Test: `backend/tests/Feature/Api/SaloonCenterRlsTest.php`

**Interfaces:**
- Consumes: tables from Task 1.
- Produces: row-level security enforced at the Postgres connection level for `providers`, `saloon_services`, `saloon_sales`, `saloon_tools` — every later query against these tables (via the app's normal `auth:sanctum` + `SetDbSessionContext` middleware flow) is automatically scoped by role/location with no application-code changes needed.

- [ ] **Step 1: Write the failing RLS test**

```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function saloonRlsFixtures(): array
{
    $shopA = DB::table('locations')->insertGetId(['name' => 'RlsShopA'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shopB = DB::table('locations')->insertGetId(['name' => 'RlsShopB'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = User::factory()->admin()->create();
    $sellerA = User::factory()->seller()->create(['location_id' => $shopA]);

    DB::statement("SELECT set_config('app.role', 'admin', false)");
    $providerId = DB::table('providers')->insertGetId(['name' => 'RlsProvider', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'RlsService', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('saloon_sales')->insert(['location_id' => $shopA, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 5000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('saloon_sales')->insert(['location_id' => $shopB, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 7000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    Sanctum::actingAs($admin);

    return compact('shopA', 'shopB', 'admin', 'sellerA', 'providerId', 'serviceId');
}

it('seller only sees saloon_sales for their own shop via RLS', function () {
    $f = saloonRlsFixtures();
    Sanctum::actingAs($f['sellerA']);
    $locationIdsJson = json_encode([$f['shopA']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $rows = DB::table('saloon_sales')->get();
        expect($rows)->toHaveCount(1);
        expect((int) $rows->first()->location_id)->toBe($f['shopA']);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('admin sees all saloon_sales via RLS', function () {
    $f = saloonRlsFixtures();
    Sanctum::actingAs($f['admin']);
    DB::statement("SELECT set_config('app.role', 'admin', false)");

    try {
        expect(DB::table('saloon_sales')->count())->toBe(2);
    } finally {
        DB::unprepared('RESET app.role');
    }
});

it('seller cannot see saloon_tools rows via RLS even at their own shop', function () {
    $f = saloonRlsFixtures();
    DB::statement("SELECT set_config('app.role', 'admin', false)");
    DB::table('saloon_tools')->insert(['location_id' => $f['shopA'], 'name' => 'Dryer', 'quantity' => 1, 'unit_cost' => 10000, 'purchase_date' => today(), 'recorded_by' => $f['admin']->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    Sanctum::actingAs($f['sellerA']);
    $locationIdsJson = json_encode([$f['shopA']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        expect(DB::table('saloon_tools')->count())->toBe(0);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('seller can select providers and saloon_services (catalog read access)', function () {
    $f = saloonRlsFixtures();
    Sanctum::actingAs($f['sellerA']);
    $locationIdsJson = json_encode([$f['shopA']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        expect(DB::table('providers')->count())->toBe(1);
        expect(DB::table('saloon_services')->count())->toBe(1);
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && php artisan test tests/Feature/Api/SaloonCenterRlsTest.php`
Expected: FAIL — RLS is not yet enabled, so a seller session can currently see rows from every shop.

- [ ] **Step 3: Write the RLS migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // ── providers, saloon_services — catalog tables (same pattern as categories)
        foreach (['providers', 'saloon_services'] as $t) {
            DB::statement("ALTER TABLE {$t} ENABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} FORCE ROW LEVEL SECURITY");
            DB::statement("CREATE POLICY {$t}_select ON {$t} FOR SELECT
                USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))");
            DB::statement("CREATE POLICY {$t}_write ON {$t} FOR ALL
                WITH CHECK (current_setting('app.role', true) = 'admin')");
        }

        // ── saloon_sales — location-scoped (seller sees own location only)
        DB::statement('ALTER TABLE saloon_sales ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE saloon_sales FORCE ROW LEVEL SECURITY');
        DB::statement("
            CREATE POLICY saloon_sales_select ON saloon_sales FOR SELECT USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )");
        DB::statement("
            CREATE POLICY saloon_sales_insert ON saloon_sales FOR INSERT WITH CHECK (
                current_setting('app.role', true) = 'admin'
                OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )");

        // ── saloon_tools — admin only, end to end
        DB::statement('ALTER TABLE saloon_tools ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE saloon_tools FORCE ROW LEVEL SECURITY');
        DB::statement("CREATE POLICY saloon_tools_select ON saloon_tools FOR SELECT
            USING (current_setting('app.role', true) = 'admin')");
        DB::statement("CREATE POLICY saloon_tools_insert ON saloon_tools FOR INSERT
            WITH CHECK (current_setting('app.role', true) = 'admin')");
    }

    public function down(): void
    {
        foreach (['providers', 'saloon_services'] as $t) {
            DB::statement("DROP POLICY IF EXISTS {$t}_select ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_write ON {$t}");
            DB::statement("ALTER TABLE {$t} DISABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} NO FORCE ROW LEVEL SECURITY");
        }
        foreach (['saloon_sales', 'saloon_tools'] as $t) {
            DB::statement("DROP POLICY IF EXISTS {$t}_select ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_insert ON {$t}");
            DB::statement("ALTER TABLE {$t} DISABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} NO FORCE ROW LEVEL SECURITY");
        }
    }
};
```

- [ ] **Step 4: Run the migration**

Run: `cd backend && "/c/laragon/bin/php/php-8.4.12-nts-Win32-vs17-x64/php.exe" artisan migrate`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && php artisan test tests/Feature/Api/SaloonCenterRlsTest.php`
Expected: PASS (all 4 tests)

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS — no regressions in existing RLS-dependent tests.

- [ ] **Step 7: Commit**

```bash
git add backend/database/migrations/2026_08_31_090500_enable_rls_for_saloon_center.php \
        backend/tests/Feature/Api/SaloonCenterRlsTest.php
git commit -m "feat(saloon-center): enable row-level security for saloon_sales, saloon_tools, providers, saloon_services"
```

---

### Task 3: Backend — Providers & Saloon Services catalog CRUD

**Files:**
- Create: `backend/app/Models/Provider.php`
- Create: `backend/app/Models/SaloonService.php`
- Create: `backend/app/Policies/ProviderPolicy.php`
- Create: `backend/app/Policies/SaloonServicePolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreProviderRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/UpdateProviderRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreSaloonServiceRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/UpdateSaloonServiceRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/ProviderController.php`
- Create: `backend/app/Http/Controllers/Api/V1/SaloonServiceController.php`
- Modify: `backend/routes/api.php` (add routes after the "POS" section, currently ending at line 86)
- Test: `backend/tests/Feature/Api/ProviderTest.php`
- Test: `backend/tests/Feature/Api/SaloonServiceTest.php`

**Interfaces:**
- Produces: `GET/POST /api/v1/providers`, `PUT/DELETE /api/v1/providers/{provider}`, and the identical shape for `/api/v1/saloon-services`. Response shape for both: `{ data: { id: number, name: string, phone?: string|null, is_active: boolean } }` (list: `{ data: [...] }`, unpaginated — small catalogs, matching `CategoryController`). Task 4 (`SaloonSaleController`) reads `Provider`/`SaloonService` via Eloquent relations by these exact class names.

- [ ] **Step 1: Write the failing backend tests**

`backend/tests/Feature/Api/ProviderTest.php`:
```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can create, list, update, and delete a provider', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $createRes = $this->postJson('/api/v1/providers', ['name' => 'Provider One', 'phone' => '0712345678'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Provider One');
    $id = $createRes->json('data.id');

    $this->getJson('/api/v1/providers')->assertOk()
        ->assertJsonFragment(['name' => 'Provider One']);

    $this->putJson("/api/v1/providers/{$id}", ['name' => 'Provider One Updated', 'is_active' => false])
        ->assertOk()
        ->assertJsonPath('data.name', 'Provider One Updated')
        ->assertJsonPath('data.is_active', false);

    $this->deleteJson("/api/v1/providers/{$id}")->assertOk();
    expect(DB::table('providers')->find($id))->toBeNull();
});

it('seller cannot create, update, or delete a provider', function () {
    Sanctum::actingAs(User::factory()->seller()->create());

    $this->postJson('/api/v1/providers', ['name' => 'X'])->assertForbidden();

    $id = DB::table('providers')->insertGetId(['name' => 'Y', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

    $this->putJson("/api/v1/providers/{$id}", ['name' => 'Z'])->assertForbidden();
    $this->deleteJson("/api/v1/providers/{$id}")->assertForbidden();
});

it('seller can list providers (read access for the log-sale dropdown)', function () {
    DB::statement("SELECT set_config('app.role', 'admin', false)");
    DB::table('providers')->insert(['name' => 'Listable', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    Sanctum::actingAs(User::factory()->seller()->create());
    $this->getJson('/api/v1/providers')->assertOk()->assertJsonFragment(['name' => 'Listable']);
});

it('cannot delete a provider referenced by a saloon sale', function () {
    Sanctum::actingAs(User::factory()->admin()->create());
    DB::statement("SELECT set_config('app.role', 'admin', false)");

    $shopId = DB::table('locations')->insertGetId(['name' => 'PShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $providerId = DB::table('providers')->insertGetId(['name' => 'Referenced', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'Svc', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = DB::table('users')->where('role', 'admin')->first();
    DB::table('saloon_sales')->insert(['location_id' => $shopId, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 1000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    $this->deleteJson("/api/v1/providers/{$providerId}")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Cannot delete this provider because it has existing saloon sales.');
});
```

`backend/tests/Feature/Api/SaloonServiceTest.php`:
```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can create, list, update, and delete a saloon service', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $createRes = $this->postJson('/api/v1/saloon-services', ['name' => 'Kuosha'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Kuosha');
    $id = $createRes->json('data.id');

    $this->getJson('/api/v1/saloon-services')->assertOk()
        ->assertJsonFragment(['name' => 'Kuosha']);

    $this->putJson("/api/v1/saloon-services/{$id}", ['name' => 'Kuosha Updated', 'is_active' => false])
        ->assertOk()
        ->assertJsonPath('data.name', 'Kuosha Updated')
        ->assertJsonPath('data.is_active', false);

    $this->deleteJson("/api/v1/saloon-services/{$id}")->assertOk();
    expect(DB::table('saloon_services')->find($id))->toBeNull();
});

it('seller cannot create a saloon service', function () {
    Sanctum::actingAs(User::factory()->seller()->create());
    $this->postJson('/api/v1/saloon-services', ['name' => 'X'])->assertForbidden();
});

it('cannot delete a saloon service referenced by a saloon sale', function () {
    Sanctum::actingAs(User::factory()->admin()->create());
    DB::statement("SELECT set_config('app.role', 'admin', false)");

    $shopId = DB::table('locations')->insertGetId(['name' => 'SShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $providerId = DB::table('providers')->insertGetId(['name' => 'P', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'Referenced Svc', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = DB::table('users')->where('role', 'admin')->first();
    DB::table('saloon_sales')->insert(['location_id' => $shopId, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 1000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    $this->deleteJson("/api/v1/saloon-services/{$serviceId}")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Cannot delete this saloon service because it has existing saloon sales.');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && php artisan test tests/Feature/Api/ProviderTest.php tests/Feature/Api/SaloonServiceTest.php`
Expected: FAIL — none of the routes/controllers/policies exist yet.

- [ ] **Step 3: Write the models**

`backend/app/Models/Provider.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Provider extends Model
{
    protected $fillable = ['name', 'phone', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }
}
```

`backend/app/Models/SaloonService.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaloonService extends Model
{
    protected $fillable = ['name', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }
}
```

- [ ] **Step 4: Write the policies**

`backend/app/Policies/ProviderPolicy.php`:
```php
<?php

namespace App\Policies;

use App\Models\User;

class ProviderPolicy
{
    public function viewAny(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function create(User $user): bool
    {
        return $user->role === 'admin';
    }

    public function update(User $user): bool
    {
        return $user->role === 'admin';
    }

    public function delete(User $user): bool
    {
        return $user->role === 'admin';
    }
}
```

`backend/app/Policies/SaloonServicePolicy.php`: identical body, class name `SaloonServicePolicy`.

- [ ] **Step 5: Write the form requests**

`backend/app/Http/Requests/Api/V1/StoreProviderRequest.php`:
```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreProviderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'name'  => ['required', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20'],
        ];
    }
}
```

`backend/app/Http/Requests/Api/V1/UpdateProviderRequest.php`:
```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProviderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'name'      => ['sometimes', 'required', 'string', 'max:100'],
            'phone'     => ['sometimes', 'nullable', 'string', 'max:20'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
```

`backend/app/Http/Requests/Api/V1/StoreSaloonServiceRequest.php`:
```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreSaloonServiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
        ];
    }
}
```

`backend/app/Http/Requests/Api/V1/UpdateSaloonServiceRequest.php`:
```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSaloonServiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'name'      => ['sometimes', 'required', 'string', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
```

- [ ] **Step 6: Write the controllers**

`backend/app/Http/Controllers/Api/V1/ProviderController.php`:
```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreProviderRequest;
use App\Http\Requests\Api\V1\UpdateProviderRequest;
use App\Models\Provider;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;

class ProviderController extends Controller
{
    private const FIELDS = ['id', 'name', 'phone', 'is_active'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Provider::class);

        return response()->json([
            'data' => Provider::orderBy('name')->get()->map->only(self::FIELDS),
        ]);
    }

    public function store(StoreProviderRequest $request): JsonResponse
    {
        $provider = Provider::create($request->validated());

        return response()->json(['data' => $provider->only(self::FIELDS)], 201);
    }

    public function update(UpdateProviderRequest $request, Provider $provider): JsonResponse
    {
        $provider->update($request->validated());

        return response()->json(['data' => $provider->only(self::FIELDS)]);
    }

    public function destroy(Provider $provider): JsonResponse
    {
        $this->authorize('delete', $provider);

        try {
            $provider->delete();
        } catch (QueryException $e) {
            if (str_contains($e->getMessage(), '23503')) {
                return response()->json([
                    'message' => 'Cannot delete this provider because it has existing saloon sales.',
                ], 422);
            }
            throw $e;
        }

        return response()->json(['message' => 'Provider deleted']);
    }
}
```

`backend/app/Http/Controllers/Api/V1/SaloonServiceController.php`:
```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreSaloonServiceRequest;
use App\Http\Requests\Api\V1\UpdateSaloonServiceRequest;
use App\Models\SaloonService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;

class SaloonServiceController extends Controller
{
    private const FIELDS = ['id', 'name', 'is_active'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', SaloonService::class);

        return response()->json([
            'data' => SaloonService::orderBy('name')->get()->map->only(self::FIELDS),
        ]);
    }

    public function store(StoreSaloonServiceRequest $request): JsonResponse
    {
        $service = SaloonService::create($request->validated());

        return response()->json(['data' => $service->only(self::FIELDS)], 201);
    }

    public function update(UpdateSaloonServiceRequest $request, SaloonService $saloonService): JsonResponse
    {
        $saloonService->update($request->validated());

        return response()->json(['data' => $saloonService->only(self::FIELDS)]);
    }

    public function destroy(SaloonService $saloonService): JsonResponse
    {
        $this->authorize('delete', $saloonService);

        try {
            $saloonService->delete();
        } catch (QueryException $e) {
            if (str_contains($e->getMessage(), '23503')) {
                return response()->json([
                    'message' => 'Cannot delete this saloon service because it has existing saloon sales.',
                ], 422);
            }
            throw $e;
        }

        return response()->json(['message' => 'Saloon service deleted']);
    }
}
```

- [ ] **Step 7: Add the routes**

In `backend/routes/api.php`, add the two `use` imports near the top (alphabetically among the existing `use App\Http\Controllers\Api\V1\...` block):
```php
use App\Http\Controllers\Api\V1\ProviderController;
use App\Http\Controllers\Api\V1\SaloonServiceController;
```

Add a new section immediately after the "POS" block (after line 86, `Route::post('/sales/{sale}/revert', ...)`):
```php
        // Saloon Center — catalogs
        Route::apiResource('/providers', ProviderController::class)->only(['index', 'store', 'update', 'destroy']);
        Route::apiResource('/saloon-services', SaloonServiceController::class)->only(['index', 'store', 'update', 'destroy']);
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && php artisan test tests/Feature/Api/ProviderTest.php tests/Feature/Api/SaloonServiceTest.php`
Expected: PASS (7 tests total)

- [ ] **Step 9: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/app/Models/Provider.php backend/app/Models/SaloonService.php \
        backend/app/Policies/ProviderPolicy.php backend/app/Policies/SaloonServicePolicy.php \
        backend/app/Http/Requests/Api/V1/StoreProviderRequest.php backend/app/Http/Requests/Api/V1/UpdateProviderRequest.php \
        backend/app/Http/Requests/Api/V1/StoreSaloonServiceRequest.php backend/app/Http/Requests/Api/V1/UpdateSaloonServiceRequest.php \
        backend/app/Http/Controllers/Api/V1/ProviderController.php backend/app/Http/Controllers/Api/V1/SaloonServiceController.php \
        backend/routes/api.php backend/tests/Feature/Api/ProviderTest.php backend/tests/Feature/Api/SaloonServiceTest.php
git commit -m "feat(saloon-center): add Providers and Saloon Services catalog CRUD"
```

---

### Task 4: Backend — Saloon Sales (log + list)

**Files:**
- Create: `backend/app/Models/SaloonSale.php`
- Create: `backend/app/Policies/SaloonSalePolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreSaloonSaleRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/SaloonSaleController.php`
- Modify: `backend/routes/api.php` (add index route in the new Saloon Center section; add store route to the `no-dups` group)
- Test: `backend/tests/Feature/Api/SaloonSaleTest.php`

**Interfaces:**
- Consumes: `Provider` (Task 3), `SaloonService` (Task 3).
- Produces: `GET /api/v1/saloon-sales?location_id=&date_from=&date_to=&page=` → `{ data: [{ id, sale_date, provider_name, service_name, amount, location_name }], meta: {current_page,last_page,per_page,total} }`; `POST /api/v1/saloon-sales` (body: `location_id?, provider_id, saloon_service_id, amount, sale_date`) → `{ data: {...same row shape...} }`. Task 7 (Dashboard) reads the raw `saloon_sales` table directly (not through this controller).

- [ ] **Step 1: Write the failing backend test**

```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function saloonSaleFixtures(): array
{
    $shopA = DB::table('locations')->insertGetId(['name' => 'SSShopA'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $shopB = DB::table('locations')->insertGetId(['name' => 'SSShopB'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = User::factory()->admin()->create();
    $storeKeeper = User::factory()->storeKeeper()->create();
    $sellerA = User::factory()->seller()->create(['location_id' => $shopA]);

    DB::statement("SELECT set_config('app.role', 'admin', false)");
    $providerId = DB::table('providers')->insertGetId(['name' => 'SSProvider', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'Kuosha', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    return compact('shopA', 'shopB', 'admin', 'storeKeeper', 'sellerA', 'providerId', 'serviceId');
}

it('seller can log a saloon sale, auto-scoped to their own shop', function () {
    $f = saloonSaleFixtures();
    Sanctum::actingAs($f['sellerA']);
    $locationIdsJson = json_encode([$f['shopA']]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->postJson('/api/v1/saloon-sales', [
            'location_id'       => $f['shopB'], // seller cannot override — ignored
            'provider_id'       => $f['providerId'],
            'saloon_service_id' => $f['serviceId'],
            'amount'            => 15000,
            'sale_date'         => today()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('data.location_name', DB::table('locations')->find($f['shopA'])->name)
            ->assertJsonPath('data.amount', '15000.00');
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('admin can log a saloon sale for any shop', function () {
    $f = saloonSaleFixtures();
    Sanctum::actingAs($f['admin']);

    $this->postJson('/api/v1/saloon-sales', [
        'location_id'       => $f['shopB'],
        'provider_id'       => $f['providerId'],
        'saloon_service_id' => $f['serviceId'],
        'amount'            => 20000,
        'sale_date'         => today()->toDateString(),
    ])
        ->assertCreated()
        ->assertJsonPath('data.location_name', DB::table('locations')->find($f['shopB'])->name);
});

it('store_keeper cannot log a saloon sale', function () {
    $f = saloonSaleFixtures();
    Sanctum::actingAs($f['storeKeeper']);

    $this->postJson('/api/v1/saloon-sales', [
        'location_id'       => $f['shopA'],
        'provider_id'       => $f['providerId'],
        'saloon_service_id' => $f['serviceId'],
        'amount'            => 1000,
        'sale_date'         => today()->toDateString(),
    ])->assertForbidden();
});

it('index filters by date range and shop, and a seller only sees their own shop', function () {
    $f = saloonSaleFixtures();
    Sanctum::actingAs($f['admin']);

    $this->postJson('/api/v1/saloon-sales', ['location_id' => $f['shopA'], 'provider_id' => $f['providerId'], 'saloon_service_id' => $f['serviceId'], 'amount' => 1000, 'sale_date' => today()->toDateString()])->assertCreated();
    $this->postJson('/api/v1/saloon-sales', ['location_id' => $f['shopB'], 'provider_id' => $f['providerId'], 'saloon_service_id' => $f['serviceId'], 'amount' => 2000, 'sale_date' => today()->toDateString()])->assertCreated();
    $this->postJson('/api/v1/saloon-sales', ['location_id' => $f['shopA'], 'provider_id' => $f['providerId'], 'saloon_service_id' => $f['serviceId'], 'amount' => 3000, 'sale_date' => today()->subDays(60)->toDateString()])->assertCreated();

    $res = $this->getJson('/api/v1/saloon-sales?location_id='.$f['shopA'].'&date_from='.today()->toDateString().'&date_to='.today()->toDateString())
        ->assertOk()
        ->assertJsonStructure(['data' => [['id', 'sale_date', 'provider_name', 'service_name', 'amount', 'location_name']], 'meta']);

    $amounts = collect($res->json('data'))->pluck('amount');
    expect($amounts)->toHaveCount(1);
    expect($amounts->first())->toBe('1000.00');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && php artisan test tests/Feature/Api/SaloonSaleTest.php`
Expected: FAIL — route/controller/model don't exist yet.

- [ ] **Step 3: Write the model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaloonSale extends Model
{
    protected $fillable = ['location_id', 'provider_id', 'saloon_service_id', 'amount', 'sale_date', 'created_by'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'sale_date' => 'date',
        ];
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(Provider::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(SaloonService::class, 'saloon_service_id');
    }
}
```

- [ ] **Step 4: Write the policy**

```php
<?php

namespace App\Policies;

use App\Models\User;

class SaloonSalePolicy
{
    public function viewAny(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function create(User $user): bool
    {
        return in_array($user->role, ['admin', 'seller']);
    }
}
```

- [ ] **Step 5: Write the form request**

```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreSaloonSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()->role, ['admin', 'seller']);
    }

    public function rules(): array
    {
        return [
            'location_id'       => ['nullable', 'integer', 'exists:locations,id'],
            'provider_id'       => ['required', 'integer', 'exists:providers,id'],
            'saloon_service_id' => ['required', 'integer', 'exists:saloon_services,id'],
            'amount'            => ['required', 'numeric', 'min:0.01'],
            'sale_date'         => ['required', 'date'],
        ];
    }
}
```

- [ ] **Step 6: Write the controller**

```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreSaloonSaleRequest;
use App\Models\SaloonSale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaloonSaleController extends Controller
{
    private function present(SaloonSale $sale): array
    {
        return [
            'id'            => $sale->id,
            'sale_date'     => $sale->sale_date->format('Y-m-d'),
            'provider_name' => $sale->provider?->name ?? '—',
            'service_name'  => $sale->service?->name ?? '—',
            'amount'        => $sale->amount,
            'location_name' => $sale->location?->name ?? '—',
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', SaloonSale::class);

        $dateFrom = $request->query('date_from', now()->startOfMonth()->toDateString());
        $dateTo   = $request->query('date_to',   now()->toDateString());

        $sales = SaloonSale::with(['location:id,name', 'provider:id,name', 'service:id,name'])
            ->when($request->query('location_id'), fn ($q, $v) => $q->where('location_id', $v))
            ->whereDate('sale_date', '>=', $dateFrom)
            ->whereDate('sale_date', '<=', $dateTo)
            ->latest('sale_date')
            ->latest('id')
            ->paginate(50);

        $paged = $sales->through(fn (SaloonSale $s) => $this->present($s));

        return response()->json([
            'data' => $paged->items(),
            'meta' => [
                'current_page' => $paged->currentPage(),
                'last_page'    => $paged->lastPage(),
                'per_page'     => $paged->perPage(),
                'total'        => $paged->total(),
            ],
        ]);
    }

    public function store(StoreSaloonSaleRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $locationId = ($user->role === 'admin' && ! empty($validated['location_id']))
            ? $validated['location_id']
            : $user->location_id;

        $sale = SaloonSale::create([
            'location_id'       => $locationId,
            'provider_id'       => $validated['provider_id'],
            'saloon_service_id' => $validated['saloon_service_id'],
            'amount'            => $validated['amount'],
            'sale_date'         => $validated['sale_date'],
            'created_by'        => $user->id,
        ]);

        $sale->load(['location:id,name', 'provider:id,name', 'service:id,name']);

        return response()->json(['data' => $this->present($sale)], 201);
    }
}
```

- [ ] **Step 7: Add the routes**

In `backend/routes/api.php`, add the import:
```php
use App\Http\Controllers\Api\V1\SaloonSaleController;
```

Extend the Saloon Center section added in Task 3:
```php
        Route::get('/saloon-sales', [SaloonSaleController::class, 'index'])->name('saloon-sales.index');
```

Add to the existing `no-dups` group (alongside `sales`/`purchases`/etc.):
```php
            Route::post('/saloon-sales', [SaloonSaleController::class, 'store'])->name('saloon-sales.store');
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd backend && php artisan test tests/Feature/Api/SaloonSaleTest.php`
Expected: PASS (4 tests)

- [ ] **Step 9: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/app/Models/SaloonSale.php backend/app/Policies/SaloonSalePolicy.php \
        backend/app/Http/Requests/Api/V1/StoreSaloonSaleRequest.php \
        backend/app/Http/Controllers/Api/V1/SaloonSaleController.php \
        backend/routes/api.php backend/tests/Feature/Api/SaloonSaleTest.php
git commit -m "feat(saloon-center): add saloon sale logging and list endpoint"
```

---

### Task 5: Backend — Saloon Tools ledger

**Files:**
- Create: `backend/app/Models/SaloonTool.php`
- Create: `backend/app/Policies/SaloonToolPolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreSaloonToolRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/SaloonToolController.php`
- Modify: `backend/routes/api.php` (add index route to the Saloon Center section; add store route to the `no-dups` group)
- Test: `backend/tests/Feature/Api/SaloonToolTest.php`

**Interfaces:**
- Produces: `GET /api/v1/saloon-tools?location_id=&page=` → `{ data: [{ id, purchase_date, location_name, name, quantity, unit_cost, total }], meta: {...} }`; `POST /api/v1/saloon-tools` (body: `location_id, name, quantity, unit_cost, purchase_date`) → `{ data: {...same row shape...} }`. Both admin-only. Task 7 (Dashboard) reads the raw `saloon_tools` table directly.

- [ ] **Step 1: Write the failing backend test**

```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can log a tool purchase and it appears in the list with the correct total', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'STShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/saloon-tools', [
        'location_id'    => $shopId,
        'name'           => 'Hair Dryer',
        'quantity'       => 3,
        'unit_cost'      => 50000,
        'purchase_date'  => today()->toDateString(),
    ])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Hair Dryer')
        ->assertJsonPath('data.quantity', 3)
        ->assertJsonPath('data.total', 150000.0);

    $this->getJson('/api/v1/saloon-tools')
        ->assertOk()
        ->assertJsonStructure(['data' => [['id', 'purchase_date', 'location_name', 'name', 'quantity', 'unit_cost', 'total']], 'meta'])
        ->assertJsonFragment(['name' => 'Hair Dryer']);
});

it('seller cannot list or log a tool purchase', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'STShop2'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->seller()->create(['location_id' => $shopId]));

    $this->getJson('/api/v1/saloon-tools')->assertForbidden();
    $this->postJson('/api/v1/saloon-tools', [
        'location_id' => $shopId, 'name' => 'X', 'quantity' => 1, 'unit_cost' => 100, 'purchase_date' => today()->toDateString(),
    ])->assertForbidden();
});

it('store_keeper cannot list or log a tool purchase', function () {
    Sanctum::actingAs(User::factory()->storeKeeper()->create());
    $this->getJson('/api/v1/saloon-tools')->assertForbidden();
});

it('quantity must be at least 1 and unit_cost cannot be negative', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'STShop3'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/saloon-tools', ['location_id' => $shopId, 'name' => 'X', 'quantity' => 0, 'unit_cost' => 100, 'purchase_date' => today()->toDateString()])
        ->assertStatus(422);
    $this->postJson('/api/v1/saloon-tools', ['location_id' => $shopId, 'name' => 'X', 'quantity' => 1, 'unit_cost' => -5, 'purchase_date' => today()->toDateString()])
        ->assertStatus(422);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && php artisan test tests/Feature/Api/SaloonToolTest.php`
Expected: FAIL — route/controller/model don't exist yet.

- [ ] **Step 3: Write the model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaloonTool extends Model
{
    protected $fillable = ['location_id', 'name', 'quantity', 'unit_cost', 'purchase_date', 'recorded_by'];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_cost' => 'decimal:2',
            'purchase_date' => 'date',
        ];
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }
}
```

- [ ] **Step 4: Write the policy**

```php
<?php

namespace App\Policies;

use App\Models\User;

class SaloonToolPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->role === 'admin';
    }

    public function create(User $user): bool
    {
        return $user->role === 'admin';
    }
}
```

- [ ] **Step 5: Write the form request**

```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreSaloonToolRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'location_id'   => ['required', 'integer', 'exists:locations,id'],
            'name'          => ['required', 'string', 'max:150'],
            'quantity'      => ['required', 'integer', 'min:1'],
            'unit_cost'     => ['required', 'numeric', 'min:0'],
            'purchase_date' => ['required', 'date'],
        ];
    }
}
```

- [ ] **Step 6: Write the controller**

```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreSaloonToolRequest;
use App\Models\SaloonTool;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaloonToolController extends Controller
{
    private function present(SaloonTool $tool): array
    {
        return [
            'id'             => $tool->id,
            'purchase_date'  => $tool->purchase_date->format('Y-m-d'),
            'location_name'  => $tool->location?->name ?? '—',
            'name'           => $tool->name,
            'quantity'       => $tool->quantity,
            'unit_cost'      => $tool->unit_cost,
            'total'          => round((float) $tool->quantity * (float) $tool->unit_cost, 2),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', SaloonTool::class);

        $tools = SaloonTool::with('location:id,name')
            ->when($request->query('location_id'), fn ($q, $v) => $q->where('location_id', $v))
            ->latest('purchase_date')
            ->latest('id')
            ->paginate(50);

        $paged = $tools->through(fn (SaloonTool $t) => $this->present($t));

        return response()->json([
            'data' => $paged->items(),
            'meta' => [
                'current_page' => $paged->currentPage(),
                'last_page'    => $paged->lastPage(),
                'per_page'     => $paged->perPage(),
                'total'        => $paged->total(),
            ],
        ]);
    }

    public function store(StoreSaloonToolRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $tool = SaloonTool::create([
            'location_id'   => $validated['location_id'],
            'name'          => $validated['name'],
            'quantity'      => $validated['quantity'],
            'unit_cost'     => $validated['unit_cost'],
            'purchase_date' => $validated['purchase_date'],
            'recorded_by'   => $user->id,
        ]);

        $tool->load('location:id,name');

        return response()->json(['data' => $this->present($tool)], 201);
    }
}
```

- [ ] **Step 7: Add the routes**

In `backend/routes/api.php`, add the import:
```php
use App\Http\Controllers\Api\V1\SaloonToolController;
```

Extend the Saloon Center section:
```php
        Route::get('/saloon-tools', [SaloonToolController::class, 'index'])->name('saloon-tools.index');
```

Add to the `no-dups` group:
```php
            Route::post('/saloon-tools', [SaloonToolController::class, 'store'])->name('saloon-tools.store');
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd backend && php artisan test tests/Feature/Api/SaloonToolTest.php`
Expected: PASS (4 tests)

- [ ] **Step 9: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/app/Models/SaloonTool.php backend/app/Policies/SaloonToolPolicy.php \
        backend/app/Http/Requests/Api/V1/StoreSaloonToolRequest.php \
        backend/app/Http/Controllers/Api/V1/SaloonToolController.php \
        backend/routes/api.php backend/tests/Feature/Api/SaloonToolTest.php
git commit -m "feat(saloon-center): add saloon tools capital ledger"
```

---

### Task 6: Backend — `business_line` on Expenses

**Files:**
- Modify: `backend/app/Models/Expense.php:10-13` (add `business_line` to `$fillable`)
- Modify: `backend/app/Http/Requests/Api/V1/StoreExpenseRequest.php:16-23` (add `business_line` validation)
- Modify: `backend/app/Http/Controllers/Api/V1/ExpenseController.php` (include `business_line` in `FIELDS` and `store()`)
- Test: `backend/tests/Feature/Api/ExpensesTest.php` (append new test cases)

**Interfaces:**
- Consumes: `expenses.business_line` column from Task 1.
- Produces: `Expense::FIELDS` (and therefore `GET /expenses` and `POST /expenses` responses) now include `business_line`. Task 7 (Dashboard) filters `DB::table('expenses')->where('business_line', 'saloon')` directly.

- [ ] **Step 1: Write the failing tests (append to the existing file)**

Append to `backend/tests/Feature/Api/ExpensesTest.php`:
```php
it('an expense defaults to business_line shop when not specified', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'BLDefaultShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->seller()->create(['location_id' => $shopId]));
    $locationIdsJson = json_encode([$shopId]);
    DB::statement("SELECT set_config('app.role', 'seller', false)");
    DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

    try {
        $this->postJson('/api/v1/expenses', [
            'category' => 'rent', 'amount' => 10000, 'expense_date' => today()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('data.business_line', 'shop');
    } finally {
        DB::unprepared('RESET app.role');
        DB::unprepared('RESET app.location_ids');
    }
});

it('an expense can be explicitly tagged as saloon business_line', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'BLSaloonShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/expenses', [
        'category' => 'rent', 'amount' => 10000, 'expense_date' => today()->toDateString(),
        'location_id' => $shopId, 'business_line' => 'saloon',
    ])
        ->assertCreated()
        ->assertJsonPath('data.business_line', 'saloon');
});

it('rejects an invalid business_line value', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'BLInvalidShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/expenses', [
        'category' => 'rent', 'amount' => 10000, 'expense_date' => today()->toDateString(),
        'location_id' => $shopId, 'business_line' => 'not_a_real_line',
    ])->assertStatus(422);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && php artisan test tests/Feature/Api/ExpensesTest.php`
Expected: FAIL — the new tests fail because `business_line` isn't accepted/returned yet (existing tests still pass).

- [ ] **Step 3: Update the model**

In `backend/app/Models/Expense.php`, change:
```php
    protected $fillable = [
        'location_id', 'category', 'amount',
        'expense_date', 'recorded_by', 'notes',
    ];
```
to:
```php
    protected $fillable = [
        'location_id', 'category', 'amount',
        'expense_date', 'recorded_by', 'notes', 'business_line',
    ];
```

- [ ] **Step 4: Update the form request**

In `backend/app/Http/Requests/Api/V1/StoreExpenseRequest.php`, add a rule to the `rules()` array:
```php
            'business_line' => ['nullable', 'in:shop,saloon'],
```

- [ ] **Step 5: Update the controller**

In `backend/app/Http/Controllers/Api/V1/ExpenseController.php`, change the `FIELDS` constant:
```php
    private const FIELDS = ['id', 'location_id', 'category', 'amount', 'expense_date', 'recorded_by', 'notes', 'business_line'];
```

And in `store()`, add `business_line` to the create array:
```php
        $expense = Expense::create([
            'location_id' => $locationId,
            'category' => $validated['category'],
            'amount' => $validated['amount'],
            'expense_date' => $validated['expense_date'],
            'recorded_by' => $user->id,
            'notes' => $validated['notes'] ?? null,
            'business_line' => $validated['business_line'] ?? 'shop',
        ]);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && php artisan test tests/Feature/Api/ExpensesTest.php`
Expected: PASS (all 8 tests — 5 existing + 3 new)

- [ ] **Step 7: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/Models/Expense.php backend/app/Http/Requests/Api/V1/StoreExpenseRequest.php \
        backend/app/Http/Controllers/Api/V1/ExpenseController.php backend/tests/Feature/Api/ExpensesTest.php
git commit -m "feat(saloon-center): tag expenses with a business_line (shop or saloon)"
```

---

### Task 7: Backend — Dashboard Saloon Center block

**Files:**
- Modify: `backend/app/Http/Controllers/Api/V1/DashboardController.php:28-186` (`adminData()` method)
- Test: `backend/tests/Feature/Api/DashboardTest.php` (append new test cases — if this file doesn't exist yet, create it following the `SalesAnalysisTest.php`/`PurchaseForecastTest.php` fixture style)

**Interfaces:**
- Consumes: `saloon_sales` (Task 4), `saloon_tools` (Task 5), `expenses.business_line` (Task 6).
- Produces: `GET /api/v1/dashboard` response gains a `saloon` key on the admin payload, shaped exactly like the existing `sales`/`profit`/`expenses`/`asset_value` keys (see Task 13 for the exact frontend type this must match).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/Api/DashboardSaloonTest.php` (a fresh file, scoped to just the new block, to avoid touching any existing dashboard test file):
```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin dashboard includes a saloon block with sales, profit at 75%, expenses, and asset value', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'DashSaloonShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = User::factory()->admin()->create();
    Sanctum::actingAs($admin);
    DB::statement("SELECT set_config('app.role', 'admin', false)");

    $providerId = DB::table('providers')->insertGetId(['name' => 'DashProvider', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'DashService', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

    // 10,000 sold today at this shop
    DB::table('saloon_sales')->insert(['location_id' => $shopId, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 10000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);

    // A saloon-tagged expense this month, and a shop-tagged one — only the saloon one should count toward the saloon card
    DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'rent', 'amount' => 4000, 'business_line' => 'saloon', 'expense_date' => today(), 'recorded_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'rent', 'amount' => 9999, 'business_line' => 'shop', 'expense_date' => today(), 'recorded_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);

    // A tool purchase: 2 x 25,000 = 50,000 capital
    DB::table('saloon_tools')->insert(['location_id' => $shopId, 'name' => 'Clipper', 'quantity' => 2, 'unit_cost' => 25000, 'purchase_date' => today(), 'recorded_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);

    DB::unprepared('RESET app.role');

    $res = $this->getJson('/api/v1/dashboard')->assertOk();

    expect($res->json('data.saloon.sales.today'))->toBe('10000.00');
    expect($res->json('data.saloon.profit.today'))->toBe('7500.00'); // 75% of 10,000
    expect($res->json('data.saloon.expenses.this_month'))->toBe('4000.00'); // only the saloon-tagged one
    expect($res->json('data.saloon.asset_value.total'))->toBe('50000.00');

    $salesByShop = collect($res->json('data.saloon.sales.today_by_shop'))->firstWhere('location_id', $shopId);
    expect($salesByShop['total'])->toBe('10000.00');
});

it('a shop-tagged expense does not appear in the saloon expenses figure', function () {
    $shopId = DB::table('locations')->insertGetId(['name' => 'DashShopOnly'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = User::factory()->admin()->create();
    Sanctum::actingAs($admin);

    DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'rent', 'amount' => 5000, 'business_line' => 'shop', 'expense_date' => today(), 'recorded_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);

    $res = $this->getJson('/api/v1/dashboard')->assertOk();
    expect((float) $res->json('data.saloon.expenses.this_month'))->toBe(0.0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && php artisan test tests/Feature/Api/DashboardSaloonTest.php`
Expected: FAIL — `data.saloon` doesn't exist yet.

- [ ] **Step 3: Add the Saloon Center block to `adminData()`**

In `backend/app/Http/Controllers/Api/V1/DashboardController.php`, insert the following immediately before the `$fmt = fn (float $v) => ...;` line (currently line 145):
```php
        // ── Saloon Center ───────────────────────────────────────────────
        $saloonSalesToday = (float) DB::table('saloon_sales')->whereDate('sale_date', today())->sum('amount');
        $saloonSalesMonth = (float) DB::table('saloon_sales')->whereYear('sale_date', $year)->whereMonth('sale_date', $month)->sum('amount');
        $saloonExpensesMonth = (float) DB::table('expenses')
            ->where('business_line', 'saloon')
            ->whereYear('expense_date', $year)->whereMonth('expense_date', $month)
            ->sum('amount');

        $saloonSalesTodayByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM(ss.amount), 0)::numeric AS total
            FROM locations l
            LEFT JOIN saloon_sales ss ON ss.location_id = l.id AND ss.sale_date::date = CURRENT_DATE
            WHERE l.type = 'shop' AND l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ");

        $saloonSalesMonthByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM(ss.amount), 0)::numeric AS total
            FROM locations l
            LEFT JOIN saloon_sales ss ON ss.location_id = l.id
                AND EXTRACT(YEAR FROM ss.sale_date) = ? AND EXTRACT(MONTH FROM ss.sale_date) = ?
            WHERE l.type = 'shop' AND l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ", [$year, $month]);

        $saloonExpensesMonthByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM(e.amount), 0)::numeric AS total
            FROM locations l
            LEFT JOIN expenses e ON e.location_id = l.id AND e.business_line = 'saloon'
                AND EXTRACT(YEAR FROM e.expense_date) = ? AND EXTRACT(MONTH FROM e.expense_date) = ?
            WHERE l.type = 'shop' AND l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ", [$year, $month]);

        $saloonAssetValue = (float) DB::table('saloon_tools as st')
            ->join('locations as l', 'l.id', '=', 'st.location_id')
            ->where('l.type', 'shop')->where('l.is_active', true)
            ->selectRaw('COALESCE(SUM(st.quantity * st.unit_cost), 0) as total')
            ->value('total');

        $saloonAssetValueByShop = DB::select("
            SELECT l.id AS location_id, l.name AS location_name,
                   COALESCE(SUM(st.quantity * st.unit_cost), 0)::numeric AS total
            FROM locations l
            LEFT JOIN saloon_tools st ON st.location_id = l.id
            WHERE l.type = 'shop' AND l.is_active = true
            GROUP BY l.id, l.name ORDER BY l.name
        ");

        $saloonProfitTodayByShop = collect($saloonSalesTodayByShop)->map(fn ($row) => (object) [
            'location_id' => $row->location_id, 'location_name' => $row->location_name, 'total' => (float) $row->total * 0.75,
        ]);
        $saloonProfitMonthByShop = collect($saloonSalesMonthByShop)->map(fn ($row) => (object) [
            'location_id' => $row->location_id, 'location_name' => $row->location_name, 'total' => (float) $row->total * 0.75,
        ]);

```

Then, inside the `return [...]` array (currently starting at line 153), add a new `'saloon'` key right after the `'store_asset_value'` key:
```php
            'saloon' => [
                'sales' => [
                    'today'              => $fmt($saloonSalesToday),
                    'today_by_shop'      => collect($saloonSalesTodayByShop)->map($fmtShop)->values(),
                    'this_month'         => $fmt($saloonSalesMonth),
                    'this_month_by_shop' => collect($saloonSalesMonthByShop)->map($fmtShop)->values(),
                ],
                'profit' => [
                    'today'              => $fmt($saloonSalesToday * 0.75),
                    'today_by_shop'      => $saloonProfitTodayByShop->map($fmtShop)->values(),
                    'this_month'         => $fmt($saloonSalesMonth * 0.75),
                    'this_month_by_shop' => $saloonProfitMonthByShop->map($fmtShop)->values(),
                ],
                'expenses' => [
                    'this_month'         => $fmt($saloonExpensesMonth),
                    'this_month_by_shop' => collect($saloonExpensesMonthByShop)->map($fmtShop)->values(),
                ],
                'asset_value' => [
                    'total'   => $fmt($saloonAssetValue),
                    'by_shop' => collect($saloonAssetValueByShop)->map($fmtShop)->values(),
                ],
            ],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && php artisan test tests/Feature/Api/DashboardSaloonTest.php`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/Api/V1/DashboardController.php backend/tests/Feature/Api/DashboardSaloonTest.php
git commit -m "feat(saloon-center): add Saloon Center block to admin dashboard"
```

---

### Task 8: Frontend — Providers & Saloon Services pages

**Files:**
- Create: `frontend/src/api/providers.ts`
- Create: `frontend/src/api/saloonServices.ts`
- Create: `frontend/src/pages/ProvidersPage.tsx`
- Create: `frontend/src/pages/SaloonServicesPage.tsx`
- Test: `frontend/src/pages/ProvidersPage.test.tsx`
- Test: `frontend/src/pages/SaloonServicesPage.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /providers`, `PUT/DELETE /providers/{id}`, and the `/saloon-services` equivalents (Task 3).
- Produces: `providersApi`, `saloonServicesApi`, and the `Provider`/`SaloonService` types — Task 9's Log Sale modal imports both API clients directly for its dropdowns.

- [ ] **Step 1: Write the failing frontend tests**

`frontend/src/pages/ProvidersPage.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProvidersPage from './ProvidersPage'
import { providersApi } from '@/api/providers'

vi.mock('@/api/providers', () => ({
  providersApi: {
    list: vi.fn(() => new Promise(() => {})),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ProvidersPage /></QueryClientProvider>)
}

describe('ProvidersPage', () => {
  it('renders heading and Add Provider button', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /providers/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add provider/i })).toBeInTheDocument()
  })

  it('lists providers returned by the API', async () => {
    vi.mocked(providersApi.list).mockResolvedValueOnce({
      data: { data: [{ id: 1, name: 'Jane Doe', phone: '0712345678', is_active: true }] },
    } as never)

    renderPage()
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('0712345678')).toBeInTheDocument()
  })

  it('opens the add-provider modal and submits a new provider', async () => {
    vi.mocked(providersApi.list).mockResolvedValue({ data: { data: [] } } as never)
    vi.mocked(providersApi.create).mockResolvedValueOnce({
      data: { data: { id: 2, name: 'New Provider', phone: null, is_active: true } },
    } as never)

    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /add provider/i }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'New Provider')
    await user.click(within(dialog).getByRole('button', { name: /^add provider$/i }))

    expect(providersApi.create).toHaveBeenCalledWith({ name: 'New Provider', phone: null })
  })
})
```

`frontend/src/pages/SaloonServicesPage.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SaloonServicesPage from './SaloonServicesPage'
import { saloonServicesApi } from '@/api/saloonServices'

vi.mock('@/api/saloonServices', () => ({
  saloonServicesApi: {
    list: vi.fn(() => new Promise(() => {})),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><SaloonServicesPage /></QueryClientProvider>)
}

describe('SaloonServicesPage', () => {
  it('renders heading and lists services', async () => {
    vi.mocked(saloonServicesApi.list).mockResolvedValueOnce({
      data: { data: [{ id: 1, name: 'Kuosha', is_active: true }] },
    } as never)

    renderPage()
    expect(screen.getByRole('heading', { name: /saloon services/i })).toBeInTheDocument()
    expect(await screen.findByText('Kuosha')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/ProvidersPage.test.tsx src/pages/SaloonServicesPage.test.tsx`
Expected: FAIL — none of these files exist yet.

- [ ] **Step 3: Write the API clients**

`frontend/src/api/providers.ts`:
```ts
import api from '@/lib/axios'

export interface Provider {
  id: number
  name: string
  phone: string | null
  is_active: boolean
}

export const providersApi = {
  list: () => api.get<{ data: Provider[] }>('/providers'),
  create: (data: { name: string; phone?: string | null }) =>
    api.post<{ data: Provider }>('/providers', data),
  update: (id: number, data: Partial<{ name: string; phone: string | null; is_active: boolean }>) =>
    api.put<{ data: Provider }>(`/providers/${id}`, data),
  delete: (id: number) => api.delete(`/providers/${id}`),
}
```

`frontend/src/api/saloonServices.ts`:
```ts
import api from '@/lib/axios'

export interface SaloonService {
  id: number
  name: string
  is_active: boolean
}

export const saloonServicesApi = {
  list: () => api.get<{ data: SaloonService[] }>('/saloon-services'),
  create: (data: { name: string }) =>
    api.post<{ data: SaloonService }>('/saloon-services', data),
  update: (id: number, data: Partial<{ name: string; is_active: boolean }>) =>
    api.put<{ data: SaloonService }>(`/saloon-services/${id}`, data),
  delete: (id: number) => api.delete(`/saloon-services/${id}`),
}
```

- [ ] **Step 4: Write `ProvidersPage.tsx`**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { Pencil, Plus, X, Trash2 } from 'lucide-react'
import { providersApi, type Provider } from '@/api/providers'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

const schema = z.object({
  name:  z.string().min(1, 'Name is required').max(100),
  phone: z.string().max(20).nullable().optional(),
})
type FormValues = z.infer<typeof schema>

type ModalProps =
  | { mode: 'create'; provider?: never; onClose: () => void }
  | { mode: 'edit';   provider: Provider; onClose: () => void }

function ProviderModal({ mode, provider, onClose }: ModalProps) {
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: mode === 'edit'
      ? { name: provider.name, phone: provider.phone ?? '' }
      : { name: '', phone: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const phone = values.phone || null
      return mode === 'create'
        ? providersApi.create({ name: values.name, phone })
        : providersApi.update(provider.id, { name: values.name, phone })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      onClose()
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
      const data = (err as ApiErr)?.response?.data
      const fieldErrors = data?.errors
      const firstField = fieldErrors ? Object.values(fieldErrors)[0]?.[0] : undefined
      setServerError(firstField ?? data?.message ?? 'An error occurred.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'create' ? 'Add Provider' : 'Edit Provider'}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(values => { setServerError(null); mutation.mutate(values) })} className="space-y-4">
          <div>
            <label htmlFor="p-name" className="block text-sm font-medium text-gray-700">Name</label>
            <input id="p-name" type="text" {...register('name')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="p-phone" className="block text-sm font-medium text-gray-700">
              Telephone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input id="p-phone" type="tel" {...register('phone')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
          </div>

          {serverError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-10 px-4 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="h-10 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : mode === 'create' ? 'Add Provider' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProvidersPage() {
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.list().then(r => r.data.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => providersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      setConfirmDeleteId(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      setDeleteError((err as ApiErr)?.response?.data?.message ?? 'Delete failed. Please try again.')
    },
  })

  const openCreate = () => { setEditing(null); setModalMode('create') }
  const openEdit   = (p: Provider) => { setEditing(p); setModalMode('edit') }
  const closeModal = () => { setModalMode(null); setEditing(null) }

  const columns = [
    { key: 'name',  header: 'Name' },
    { key: 'phone', header: 'Telephone', render: (p: Provider) => p.phone ?? '—' },
    {
      key: 'is_active',
      header: 'Status',
      render: (p: Provider) => <Badge variant={p.is_active ? 'success' : 'default'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (p: Provider) => (
        <div className="flex items-center gap-3">
          <button onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}
            className="flex items-center gap-1 text-xs text-primary-600 hover:underline">
            <Pencil size={12} /> Edit
          </button>
          {confirmDeleteId === p.id ? (
            <span className="flex items-center gap-2">
              <button onClick={() => deleteMutation.mutate(p.id)} disabled={deleteMutation.isPending}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded disabled:opacity-50">
                {deleteMutation.isPending ? '…' : 'Confirm'}
              </button>
              <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => { setConfirmDeleteId(p.id); setDeleteError(null) }} aria-label={`Delete ${p.name}`}
              className="flex items-center gap-1 text-xs text-red-500 hover:underline">
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Providers</h1>
        <button onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-9 text-sm font-medium text-white hover:bg-primary-700">
          <Plus size={16} /> Add Provider
        </button>
      </div>

      {deleteError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}

      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} emptyMessage="No providers found." />

      {modalMode === 'create' && <ProviderModal mode="create" onClose={closeModal} />}
      {modalMode === 'edit' && editing && <ProviderModal mode="edit" provider={editing} onClose={closeModal} />}
    </div>
  )
}
```

- [ ] **Step 5: Write `SaloonServicesPage.tsx`**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { Pencil, Plus, X, Trash2 } from 'lucide-react'
import { saloonServicesApi, type SaloonService } from '@/api/saloonServices'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
})
type FormValues = z.infer<typeof schema>

type ModalProps =
  | { mode: 'create'; service?: never; onClose: () => void }
  | { mode: 'edit';   service: SaloonService; onClose: () => void }

function SaloonServiceModal({ mode, service, onClose }: ModalProps) {
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: mode === 'edit' ? service.name : '' },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      mode === 'create' ? saloonServicesApi.create(values) : saloonServicesApi.update(service.id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saloon-services'] })
      onClose()
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
      const data = (err as ApiErr)?.response?.data
      const fieldErrors = data?.errors
      const firstField = fieldErrors ? Object.values(fieldErrors)[0]?.[0] : undefined
      setServerError(firstField ?? data?.message ?? 'An error occurred.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'create' ? 'Add Saloon Service' : 'Edit Saloon Service'}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(values => { setServerError(null); mutation.mutate(values) })} className="space-y-4">
          <div>
            <label htmlFor="ss-name" className="block text-sm font-medium text-gray-700">Name</label>
            <input id="ss-name" type="text" {...register('name')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          {serverError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-10 px-4 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="h-10 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : mode === 'create' ? 'Add Service' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SaloonServicesPage() {
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<SaloonService | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['saloon-services'],
    queryFn: () => saloonServicesApi.list().then(r => r.data.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => saloonServicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saloon-services'] })
      setConfirmDeleteId(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      setDeleteError((err as ApiErr)?.response?.data?.message ?? 'Delete failed. Please try again.')
    },
  })

  const openCreate = () => { setEditing(null); setModalMode('create') }
  const openEdit   = (s: SaloonService) => { setEditing(s); setModalMode('edit') }
  const closeModal = () => { setModalMode(null); setEditing(null) }

  const columns = [
    { key: 'name', header: 'Service Name' },
    {
      key: 'is_active',
      header: 'Status',
      render: (s: SaloonService) => <Badge variant={s.is_active ? 'success' : 'default'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (s: SaloonService) => (
        <div className="flex items-center gap-3">
          <button onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}
            className="flex items-center gap-1 text-xs text-primary-600 hover:underline">
            <Pencil size={12} /> Edit
          </button>
          {confirmDeleteId === s.id ? (
            <span className="flex items-center gap-2">
              <button onClick={() => deleteMutation.mutate(s.id)} disabled={deleteMutation.isPending}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded disabled:opacity-50">
                {deleteMutation.isPending ? '…' : 'Confirm'}
              </button>
              <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => { setConfirmDeleteId(s.id); setDeleteError(null) }} aria-label={`Delete ${s.name}`}
              className="flex items-center gap-1 text-xs text-red-500 hover:underline">
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Saloon Services</h1>
        <button onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-9 text-sm font-medium text-white hover:bg-primary-700">
          <Plus size={16} /> Add Service
        </button>
      </div>

      {deleteError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}

      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} emptyMessage="No saloon services found." />

      {modalMode === 'create' && <SaloonServiceModal mode="create" onClose={closeModal} />}
      {modalMode === 'edit' && editing && <SaloonServiceModal mode="edit" service={editing} onClose={closeModal} />}
    </div>
  )
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/ProvidersPage.test.tsx src/pages/SaloonServicesPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/providers.ts frontend/src/api/saloonServices.ts \
        frontend/src/pages/ProvidersPage.tsx frontend/src/pages/SaloonServicesPage.tsx \
        frontend/src/pages/ProvidersPage.test.tsx frontend/src/pages/SaloonServicesPage.test.tsx
git commit -m "feat(saloon-center): add Providers and Saloon Services admin pages"
```

---

### Task 9: Frontend — Saloon Center page (list + log sale)

**Files:**
- Create: `frontend/src/api/saloonSales.ts`
- Create: `frontend/src/pages/SaloonCenterPage.tsx`
- Test: `frontend/src/pages/SaloonCenterPage.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /saloon-sales` (Task 4), `providersApi`/`saloonServicesApi` (Task 8), `locationsApi` (existing).
- Produces: nothing consumed by later tasks — this is a leaf page, wired into routing/sidebar in Task 11.

- [ ] **Step 1: Write the failing frontend test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import SaloonCenterPage from './SaloonCenterPage'
import { saloonSalesApi } from '@/api/saloonSales'
import { providersApi } from '@/api/providers'
import { saloonServicesApi } from '@/api/saloonServices'
import { locationsApi } from '@/api/locations'
import type { User } from '@/types'

// AuthProvider defaults to unauthenticated (no "Log Sale" button would render) unless
// localStorage already has a user — matches the pattern in AuthContext.test.tsx.
const sellerUser: User = { id: 1, name: 'Seller One', email: 'seller@test.com', role: 'seller', location_id: 1, is_active: true, created_at: '', updated_at: '' }

beforeEach(() => {
  localStorage.setItem('auth_user', JSON.stringify(sellerUser))
})

vi.mock('@/api/saloonSales', () => ({
  saloonSalesApi: {
    list: vi.fn(() => Promise.resolve({
      data: {
        data: [{ id: 1, sale_date: '2026-08-31', provider_name: 'Jane', service_name: 'Kuosha', amount: '5000.00', location_name: 'Shop A' }],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 1 },
      },
    })),
    create: vi.fn(),
  },
}))
vi.mock('@/api/providers', () => ({
  providersApi: { list: vi.fn(() => Promise.resolve({ data: { data: [{ id: 1, name: 'Jane', phone: null, is_active: true }] } })) },
}))
vi.mock('@/api/saloonServices', () => ({
  saloonServicesApi: { list: vi.fn(() => Promise.resolve({ data: { data: [{ id: 1, name: 'Kuosha', is_active: true }] } })) },
}))
vi.mock('@/api/locations', () => ({
  locationsApi: { list: vi.fn(() => Promise.resolve({ data: { data: [{ id: 1, name: 'Shop A', type: 'shop', is_active: true }] } })) },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <SaloonCenterPage />
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('SaloonCenterPage', () => {
  it('renders heading and the list of logged services', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /saloon center/i })).toBeInTheDocument()
    expect(await screen.findByText('Jane')).toBeInTheDocument()
    expect(screen.getByText('Kuosha')).toBeInTheDocument()
  })

  it('opens the Log Sale modal', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /log sale/i }))
    expect(screen.getByRole('heading', { name: /log saloon sale/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/SaloonCenterPage.test.tsx`
Expected: FAIL — none of these files exist yet.

- [ ] **Step 3: Write the API client**

`frontend/src/api/saloonSales.ts`:
```ts
import api from '@/lib/axios'
import type { PaginatedResponse } from '@/types'

export interface SaloonSale {
  id: number
  sale_date: string
  provider_name: string
  service_name: string
  amount: string
  location_name: string
}

export const saloonSalesApi = {
  list: (params?: { location_id?: number | ''; date_from?: string; date_to?: string; page?: number }) =>
    api.get<PaginatedResponse<SaloonSale>>('/saloon-sales', { params }),
  create: (data: { location_id?: number; provider_id: number; saloon_service_id: number; amount: number; sale_date: string }) =>
    api.post<{ data: SaloonSale }>('/saloon-sales', data),
}
```

- [ ] **Step 4: Write `SaloonCenterPage.tsx`**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus } from 'lucide-react'
import { saloonSalesApi } from '@/api/saloonSales'
import { providersApi } from '@/api/providers'
import { saloonServicesApi } from '@/api/saloonServices'
import { locationsApi } from '@/api/locations'
import { useAuth } from '@/contexts/AuthContext'
import DataTable from '@/components/ui/DataTable'

const today = new Date()
const defaultDateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
const defaultDateTo   = today.toISOString().split('T')[0]

function fmt(n: string | number) {
  return Number(n).toLocaleString('en-US')
}

function LogSaleModal({ onClose, isAdmin }: { onClose: () => void; isAdmin: boolean }) {
  const qc = useQueryClient()
  const [locationId, setLocationId] = useState('')
  const [providerId, setProviderId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [saleDate, setSaleDate] = useState(defaultDateTo)
  const [error, setError] = useState<string | null>(null)

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
    enabled: isAdmin,
  })
  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.list().then(r => r.data.data),
  })
  const { data: services } = useQuery({
    queryKey: ['saloon-services'],
    queryFn: () => saloonServicesApi.list().then(r => r.data.data),
  })

  const mutation = useMutation({
    mutationFn: () => saloonSalesApi.create({
      ...(isAdmin && locationId ? { location_id: Number(locationId) } : {}),
      provider_id: Number(providerId),
      saloon_service_id: Number(serviceId),
      amount: Number(amount),
      sale_date: saleDate,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saloon-sales'] })
      onClose()
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      setError((err as ApiErr)?.response?.data?.message ?? 'Failed to log sale. Please try again.')
    },
  })

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (isAdmin && !locationId) { setError('Select a shop.'); return }
    if (!providerId) { setError('Select a provider.'); return }
    if (!serviceId) { setError('Select a service.'); return }
    const parsedAmount = Number(amount)
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) { setError('Enter a valid amount greater than 0.'); return }
    setError(null)
    mutation.mutate()
  }

  const activeShops     = (locations ?? []).filter(l => l.type === 'shop' && l.is_active)
  const activeProviders = (providers ?? []).filter(p => p.is_active)
  const activeServices  = (services ?? []).filter(s => s.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Log Saloon Sale</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isAdmin && (
            <div>
              <label htmlFor="ls-shop" className="block text-sm font-medium text-gray-700">Shop</label>
              <select id="ls-shop" value={locationId} onChange={e => setLocationId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
                <option value="">— Select shop —</option>
                {activeShops.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="ls-provider" className="block text-sm font-medium text-gray-700">Provider</label>
            <select id="ls-provider" value={providerId} onChange={e => setProviderId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="">— Select provider —</option>
              {activeProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="ls-service" className="block text-sm font-medium text-gray-700">Service</label>
            <select id="ls-service" value={serviceId} onChange={e => setServiceId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="">— Select service —</option>
              {activeServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="ls-amount" className="block text-sm font-medium text-gray-700">Amount (TZS)</label>
            <input id="ls-amount" type="number" min="0" step="1" value={amount} onChange={e => setAmount(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>

          <div>
            <label htmlFor="ls-date" className="block text-sm font-medium text-gray-700">Date</label>
            <input id="ls-date" type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-10 px-4 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="h-10 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Log Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SaloonCenterPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canLogSale = user?.role === 'admin' || user?.role === 'seller'

  const [locationId, setLocationId] = useState<number | ''>('')
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [page, setPage] = useState(1)
  const [showLogSale, setShowLogSale] = useState(false)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['saloon-sales', locationId, dateFrom, dateTo, page],
    queryFn: () => saloonSalesApi.list({ location_id: locationId || undefined, date_from: dateFrom, date_to: dateTo, page }).then(r => r.data),
  })

  const columns = [
    { key: 'sale_date', header: 'Date', render: (s: { sale_date: string }) => new Date(s.sale_date).toLocaleDateString() },
    { key: 'provider_name', header: 'Provider' },
    { key: 'service_name', header: 'Service' },
    { key: 'amount', header: 'Amount (TZS)', render: (s: { amount: string }) => fmt(s.amount) },
    { key: 'location_name', header: 'Shop' },
  ]

  const activeShops = (locationsData ?? []).filter(l => l.type === 'shop' && l.is_active)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Saloon Center</h1>
        {canLogSale && (
          <button onClick={() => setShowLogSale(true)}
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700">
            <Plus size={16} /> Log Sale
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="sc-shop" className="block text-xs font-medium text-gray-500 mb-1">Shop</label>
          <select id="sc-shop" value={locationId} onChange={e => { setLocationId(e.target.value === '' ? '' : Number(e.target.value)); setPage(1) }}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
            <option value="">All shops</option>
            {activeShops.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sc-from" className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input id="sc-from" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="sc-to" className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input id="sc-to" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No services logged for this period." />

      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {data.meta.current_page} of {data.meta.last_page}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50">
              Previous
            </button>
            <button disabled={page === data.meta.last_page} onClick={() => setPage(p => p + 1)}
              className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50">
              Next
            </button>
          </div>
        </div>
      )}

      {showLogSale && <LogSaleModal onClose={() => setShowLogSale(false)} isAdmin={isAdmin} />}
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/SaloonCenterPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/saloonSales.ts frontend/src/pages/SaloonCenterPage.tsx frontend/src/pages/SaloonCenterPage.test.tsx
git commit -m "feat(saloon-center): add Saloon Center page with service list and log-sale form"
```

---

### Task 10: Frontend — Saloon Tools page

**Files:**
- Create: `frontend/src/api/saloonTools.ts`
- Create: `frontend/src/pages/SaloonToolsPage.tsx`
- Test: `frontend/src/pages/SaloonToolsPage.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /saloon-tools` (Task 5), `locationsApi` (existing).
- Produces: nothing consumed by later tasks — wired into routing/sidebar in Task 11.

- [ ] **Step 1: Write the failing frontend test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SaloonToolsPage from './SaloonToolsPage'
import { saloonToolsApi } from '@/api/saloonTools'
import { locationsApi } from '@/api/locations'

vi.mock('@/api/saloonTools', () => ({
  saloonToolsApi: {
    list: vi.fn(() => Promise.resolve({
      data: {
        data: [{ id: 1, purchase_date: '2026-08-31', location_name: 'Shop A', name: 'Hair Dryer', quantity: 3, unit_cost: '50000.00', total: 150000 }],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 1 },
      },
    })),
    create: vi.fn(),
  },
}))
vi.mock('@/api/locations', () => ({
  locationsApi: { list: vi.fn(() => Promise.resolve({ data: { data: [{ id: 1, name: 'Shop A', type: 'shop', is_active: true }] } })) },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><SaloonToolsPage /></QueryClientProvider>)
}

describe('SaloonToolsPage', () => {
  it('renders heading and lists logged tool purchases', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /saloon tools/i })).toBeInTheDocument()
    expect(await screen.findByText('Hair Dryer')).toBeInTheDocument()
  })

  it('submits a new tool purchase', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.selectOptions(await screen.findByLabelText(/shop/i), '1')
    await user.type(screen.getByLabelText(/item name/i), 'Clipper')
    await user.clear(screen.getByLabelText(/quantity/i))
    await user.type(screen.getByLabelText(/quantity/i), '2')
    await user.type(screen.getByLabelText(/unit cost/i), '25000')
    await user.click(screen.getByRole('button', { name: /add purchase/i }))

    expect(saloonToolsApi.create).toHaveBeenCalledWith(expect.objectContaining({
      location_id: 1, name: 'Clipper', quantity: 2, unit_cost: 25000,
    }))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/SaloonToolsPage.test.tsx`
Expected: FAIL — none of these files exist yet.

- [ ] **Step 3: Write the API client**

`frontend/src/api/saloonTools.ts`:
```ts
import api from '@/lib/axios'
import type { PaginatedResponse } from '@/types'

export interface SaloonTool {
  id: number
  purchase_date: string
  location_name: string
  name: string
  quantity: number
  unit_cost: string
  total: number
}

export const saloonToolsApi = {
  list: (params?: { location_id?: number | ''; page?: number }) =>
    api.get<PaginatedResponse<SaloonTool>>('/saloon-tools', { params }),
  create: (data: { location_id: number; name: string; quantity: number; unit_cost: number; purchase_date: string }) =>
    api.post<{ data: SaloonTool }>('/saloon-tools', data),
}
```

- [ ] **Step 4: Write `SaloonToolsPage.tsx`**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { saloonToolsApi } from '@/api/saloonTools'
import { locationsApi } from '@/api/locations'
import DataTable from '@/components/ui/DataTable'

function fmt(n: string | number) {
  return Number(n).toLocaleString('en-US')
}

const todayStr = new Date().toISOString().split('T')[0]

export default function SaloonToolsPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [locationId, setLocationId] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayStr)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['saloon-tools', page],
    queryFn: () => saloonToolsApi.list({ page }).then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: () => saloonToolsApi.create({
      location_id: Number(locationId),
      name,
      quantity: Number(quantity),
      unit_cost: Number(unitCost),
      purchase_date: purchaseDate,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saloon-tools'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setName('')
      setQuantity('1')
      setUnitCost('')
      setError(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      setError((err as ApiErr)?.response?.data?.message ?? 'Failed to record purchase.')
      setSuccess(false)
    },
  })

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!locationId) { setError('Select a shop.'); return }
    if (!name.trim()) { setError('Enter an item name.'); return }
    const parsedQty = Number(quantity)
    if (!quantity || isNaN(parsedQty) || parsedQty < 1) { setError('Quantity must be at least 1.'); return }
    const parsedCost = Number(unitCost)
    if (!unitCost || isNaN(parsedCost) || parsedCost < 0) { setError('Enter a valid unit cost.'); return }
    setError(null)
    mutation.mutate()
  }

  const activeShops = (locationsData ?? []).filter(l => l.type === 'shop' && l.is_active)

  const columns = [
    { key: 'purchase_date', header: 'Date', render: (t: { purchase_date: string }) => new Date(t.purchase_date).toLocaleDateString() },
    { key: 'location_name', header: 'Shop' },
    { key: 'name', header: 'Item' },
    { key: 'quantity', header: 'Quantity' },
    { key: 'unit_cost', header: 'Unit Cost (TZS)', render: (t: { unit_cost: string }) => fmt(t.unit_cost) },
    { key: 'total', header: 'Total (TZS)', render: (t: { total: number }) => fmt(t.total) },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Saloon Tools</h1>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end rounded-lg border border-gray-200 p-4">
        <div>
          <label htmlFor="st-shop" className="block text-xs font-medium text-gray-500 mb-1">Shop</label>
          <select id="st-shop" value={locationId} onChange={e => setLocationId(e.target.value)}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
            <option value="">— Select shop —</option>
            {activeShops.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="st-name" className="block text-xs font-medium text-gray-500 mb-1">Item Name</label>
          <input id="st-name" type="text" value={name} onChange={e => setName(e.target.value)}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="st-qty" className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
          <input id="st-qty" type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)}
            className="w-24 rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="st-cost" className="block text-xs font-medium text-gray-500 mb-1">Unit Cost (TZS)</label>
          <input id="st-cost" type="number" min="0" step="1" value={unitCost} onChange={e => setUnitCost(e.target.value)}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="st-date" className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input id="st-date" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
            className="rounded-md border border-gray-300 h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
        </div>
        <button type="submit" disabled={mutation.isPending}
          className="h-9 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {mutation.isPending ? 'Saving…' : 'Add Purchase'}
        </button>
      </form>

      {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Purchase recorded.</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No tool purchases logged yet." />

      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {data.meta.current_page} of {data.meta.last_page}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50">
              Previous
            </button>
            <button disabled={page === data.meta.last_page} onClick={() => setPage(p => p + 1)}
              className="rounded border border-gray-200 px-3 h-8 disabled:opacity-40 hover:bg-gray-50">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/SaloonToolsPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/saloonTools.ts frontend/src/pages/SaloonToolsPage.tsx frontend/src/pages/SaloonToolsPage.test.tsx
git commit -m "feat(saloon-center): add Saloon Tools capital ledger page"
```

---

### Task 11: Frontend — Sidebar + routing

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx:34-96`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.test.tsx` (if it exists — check with `Glob frontend/src/components/layout/Sidebar.test.tsx` before editing; if absent, skip this file)

**Interfaces:**
- Consumes: `SaloonCenterPage` (Task 9), `ProvidersPage`/`SaloonServicesPage` (Task 8), `SaloonToolsPage` (Task 10).
- Produces: `/saloon-center`, `/providers`, `/saloon-services`, `/saloon-tools` are reachable routes.

- [ ] **Step 1: Write the failing test**

Check whether `frontend/src/components/layout/Sidebar.test.tsx` exists:
```bash
ls frontend/src/components/layout/Sidebar.test.tsx 2>/dev/null || echo "NOT FOUND"
```
If it exists, read it first and add a test asserting the "Saloon Center" link renders for a seller-role user, following that file's existing render-helper pattern. If it does **not** exist (most likely, based on this codebase), skip straight to Step 3 — router wiring is exercised indirectly by every page's own test (Tasks 8-10 already assert each page renders standalone) and by the manual verification in Task 14.

- [ ] **Step 2: (skip if Sidebar.test.tsx doesn't exist)**

- [ ] **Step 3: Update the Sidebar**

In `frontend/src/components/layout/Sidebar.tsx`, add `Scissors` to the `lucide-react` import (line 6):
```ts
  LayoutDashboard, Package, Boxes, Truck, ShoppingCart, CreditCard, FileText,
  Users, TrendingUp, ClipboardCheck, Clock, Receipt, UserRound, Tag, BarChart2,
  BrainCircuit, TrendingDown, ChevronDown, Trophy, Zap, Settings, RefreshCw,
  FileBarChart, Scissors,
  type LucideIcon,
```

Insert a new flat link immediately after the Reconciliation entry (currently line 37):
```ts
  { kind: 'link', to: '/reconciliations', label: 'Reconciliation', icon: ClipboardCheck,  roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/saloon-center',   label: 'Saloon Center',  icon: Scissors,        roles: ['admin', 'store_keeper', 'seller'] },
```

Add three new children to the Settings group (currently lines 62-75), after "Clients":
```ts
      { kind: 'link', to: '/clients',          label: 'Clients',          icon: UserRound },
      { kind: 'link', to: '/providers',        label: 'Providers',        icon: UserRound },
      { kind: 'link', to: '/saloon-services',  label: 'Saloon Services',  icon: Scissors },
      { kind: 'link', to: '/saloon-tools',     label: 'Saloon Tools',     icon: Boxes },
```

- [ ] **Step 4: Update the router**

In `frontend/src/router.tsx`, add the imports:
```tsx
import SaloonCenterPage from '@/pages/SaloonCenterPage'
import ProvidersPage from '@/pages/ProvidersPage'
import SaloonServicesPage from '@/pages/SaloonServicesPage'
import SaloonToolsPage from '@/pages/SaloonToolsPage'
```

Add `saloon-center` to the "All authenticated roles" block (after `{ path: 'reconciliations', element: <ReconciliationPage /> },`):
```tsx
          { path: 'reconciliations', element: <ReconciliationPage /> },
          { path: 'saloon-center', element: <SaloonCenterPage /> },
```

Add `providers`, `saloon-services`, `saloon-tools` to the admin-only `RoleRoute allow={['admin']}` block (after `{ path: 'categories', element: <CategoriesPage /> },`):
```tsx
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'providers', element: <ProvidersPage /> },
              { path: 'saloon-services', element: <SaloonServicesPage /> },
              { path: 'saloon-tools', element: <SaloonToolsPage /> },
```

- [ ] **Step 5: Run the full frontend suite to check for regressions**

Run: `cd frontend && npx vitest run`
Expected: PASS — no regressions (existing Sidebar tests, if any, should still pass; every new page already has its own passing test from Tasks 8-10).

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx frontend/src/router.tsx
git commit -m "feat(saloon-center): wire Saloon Center pages into sidebar and routing"
```

---

### Task 12: Frontend — Expenses business-line selector

**Files:**
- Modify: `frontend/src/api/expenses.ts:4-19` (`ExpenseCategory`/`Expense`/`create` types)
- Modify: `frontend/src/pages/ExpensesPage.tsx` (add the selector + include in submission + show in the table)
- Modify: `frontend/src/pages/ExpensesPage.test.tsx` (this file already exists — see its current content below; append to it, don't replace it)

**Interfaces:**
- Consumes: `expenses.business_line` (Task 6 backend).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

`frontend/src/pages/ExpensesPage.test.tsx` currently contains exactly this:
```tsx
import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import ExpensesPage from './ExpensesPage'

it('expenses page renders heading and form', () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  render(
    <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
      <ExpensesPage />
    </MemoryRouter></AuthProvider></QueryClientProvider>
  )
  expect(screen.getByRole('heading', { name: /expenses/i })).toBeInTheDocument()
  expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
})
```

Replace the entire file with this (keeps the original test byte-for-byte, adds the mock needed for the new tests, and adds two new tests):
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import ExpensesPage from './ExpensesPage'
import { expensesApi } from '@/api/expenses'

vi.mock('@/api/expenses', () => ({
  EXPENSE_CATEGORIES: ['salary', 'security', 'electricity', 'cleanliness', 'rent', 'transport'],
  BUSINESS_LINES: ['shop', 'saloon'],
  expensesApi: {
    list: vi.fn(() => new Promise(() => {})),
    create: vi.fn(() => Promise.resolve({ data: { data: {} } })),
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
      <ExpensesPage />
    </MemoryRouter></AuthProvider></QueryClientProvider>
  )
}

it('expenses page renders heading and form', () => {
  renderPage()
  expect(screen.getByRole('heading', { name: /expenses/i })).toBeInTheDocument()
  expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
})

describe('ExpensesPage business line', () => {
  it('submits business_line "saloon" when the Saloon Center option is chosen', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByLabelText(/business line/i), 'saloon')
    await user.type(screen.getByLabelText(/amount/i), '5000')
    await user.click(screen.getByRole('button', { name: /record expense/i }))

    expect(expensesApi.create).toHaveBeenCalledWith(expect.objectContaining({ business_line: 'saloon' }))
  })

  it('defaults to business_line "shop"', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/amount/i), '5000')
    await user.click(screen.getByRole('button', { name: /record expense/i }))

    expect(expensesApi.create).toHaveBeenCalledWith(expect.objectContaining({ business_line: 'shop' }))
  })
})
```

- [ ] **Step 2: Run the test to verify the two new tests fail**

Run: `cd frontend && npx vitest run src/pages/ExpensesPage.test.tsx`
Expected: the original test still PASSes; the two new "business line" tests FAIL — no "Business line" field exists yet.

- [ ] **Step 3: Update the API client types**

In `frontend/src/api/expenses.ts`, add after the `EXPENSE_CATEGORIES`/`ExpenseCategory` declaration (currently lines 4-8):
```ts
export const BUSINESS_LINES = ['shop', 'saloon'] as const
export type BusinessLine = typeof BUSINESS_LINES[number]
```

Update the `Expense` interface (currently lines 10-19) to add one field:
```ts
export interface Expense {
  id: number
  location_id: number
  location_name: string | null
  category: ExpenseCategory
  amount: string
  expense_date: string
  recorded_by: number
  notes: string | null
  business_line: BusinessLine
}
```

Update `expensesApi.create`'s parameter type (currently line 35):
```ts
  create: (data: { category: ExpenseCategory; amount: number; expense_date: string; notes?: string; location_id?: number; business_line?: BusinessLine }) =>
    api.post<ApiResponse<Expense>>('/expenses', data),
```

- [ ] **Step 4: Update `ExpensesPage.tsx`**

Change the import on line 3 from:
```ts
import { expensesApi, EXPENSE_CATEGORIES, type Expense } from '@/api/expenses'
```
to:
```ts
import { expensesApi, EXPENSE_CATEGORIES, BUSINESS_LINES, type BusinessLine, type Expense } from '@/api/expenses'
```

Add a column to the `columns` array (currently lines 8-14), right after the `location_name` column:
```ts
  { key: 'business_line', header: 'Business Line', render: (e: Expense) => <span className="capitalize">{e.business_line === 'saloon' ? 'Saloon Center' : 'Shop'}</span> },
```

Add state, right after the `category` state declaration (currently line 22):
```ts
  const [businessLine, setBusinessLine] = useState<BusinessLine>('shop')
```

In `mutation.mutate(...)` inside `handleSubmit` (currently lines 67-73), add `business_line`:
```ts
    mutation.mutate({
      category,
      amount: parsedAmount,
      expense_date: date,
      notes: notes || undefined,
      location_id: isAdmin && locationId ? Number(locationId) : undefined,
      business_line: businessLine,
    })
```

In the mutation's `onSuccess` (currently lines 42-51), reset it alongside the other fields:
```ts
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setAmount('')
      setNotes('')
      setLocationId('')
      setBusinessLine('shop')
      setError(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
```

Add a "Business Line" `<select>` right after the Category/Date grid (currently lines 106-131, closing `</div>` of the `grid grid-cols-1 sm:grid-cols-2 gap-4` block), before the Amount field:
```tsx
          <div>
            <label htmlFor="exp-business-line" className="block text-sm font-medium text-gray-700">Business Line</label>
            <select
              id="exp-business-line"
              value={businessLine}
              onChange={e => setBusinessLine(e.target.value as BusinessLine)}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            >
              {BUSINESS_LINES.map(line => (
                <option key={line} value={line}>{line === 'saloon' ? 'Saloon Center' : 'Shop'}</option>
              ))}
            </select>
          </div>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/ExpensesPage.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Run the full frontend suite to check for regressions**

Run: `cd frontend && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/expenses.ts frontend/src/pages/ExpensesPage.tsx frontend/src/pages/ExpensesPage.test.tsx
git commit -m "feat(saloon-center): add Business Line selector to the Expenses form"
```

---

### Task 13: Frontend — Dashboard Saloon Center section

**Files:**
- Modify: `frontend/src/api/dashboard.ts:9-38` (`AdminDashboard` type)
- Modify: `frontend/src/pages/DashboardPage.tsx:93-140` (admin dashboard block)
- Modify: `frontend/src/pages/DashboardPage.test.tsx` (this file already exists — see its current content below; extend it, don't replace its existing test)

**Interfaces:**
- Consumes: `data.saloon` shape from the backend (Task 7).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

`frontend/src/pages/DashboardPage.test.tsx` currently contains exactly this:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import DashboardPage from './DashboardPage'

// Prevent real API calls — queries will stay in fetching state (isLoading: true)
vi.mock('@/api/dashboard', () => ({
  dashboardApi: { get: () => new Promise(() => {}) },
}))
vi.mock('@/api/news', () => ({
  newsApi: { list: () => new Promise(() => {}) },
}))

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  it('renders loading state initially', () => {
    renderDashboard()
    expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument()
  })
})
```

Replace the entire file with this (keeps the original test and `renderDashboard` helper, changes the `dashboardApi.get` mock to a `vi.fn()` so it can be resolved per-test, and adds a new `describe` block):
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import DashboardPage from './DashboardPage'
import { dashboardApi } from '@/api/dashboard'

// Prevent real API calls — queries will stay in fetching state (isLoading: true) unless a test resolves them
vi.mock('@/api/dashboard', () => ({
  dashboardApi: { get: vi.fn(() => new Promise(() => {})) },
}))
vi.mock('@/api/news', () => ({
  newsApi: { list: () => new Promise(() => {}) },
}))

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  it('renders loading state initially', () => {
    renderDashboard()
    expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument()
  })
})

const adminDashboardWithSaloon = {
  role: 'admin',
  sales: { today: '100000.00', today_by_shop: [], this_month: '2000000.00', this_month_by_shop: [] },
  expenses: { this_month: '50000.00', this_month_by_shop: [] },
  profit: { today: '30000.00', today_by_shop: [], this_month: '600000.00', this_month_by_shop: [] },
  asset_value: { total: '1000000.00', by_shop: [] },
  store_asset_value: { total: '500000.00', by_location: [] },
  saloon: {
    sales: { today: '10000.00', today_by_shop: [], this_month: '250000.00', this_month_by_shop: [] },
    profit: { today: '7500.00', today_by_shop: [], this_month: '187500.00', this_month_by_shop: [] },
    expenses: { this_month: '4000.00', this_month_by_shop: [] },
    asset_value: { total: '150000.00', by_shop: [] },
  },
  distributions: { pending: 0 },
  stock: { expiry_alerts: 0, low_stock_alerts: 0 },
  users: { active: 1 },
}

describe('DashboardPage Saloon Center section', () => {
  it('renders a Saloon Center heading and its six cards', async () => {
    vi.mocked(dashboardApi.get).mockResolvedValueOnce({ data: { data: adminDashboardWithSaloon } } as never)

    renderDashboard()

    expect(await screen.findByText(/saloon center/i)).toBeInTheDocument()
    expect(screen.getAllByText(/sales today/i).length).toBeGreaterThan(0)
    expect(screen.getByText('TZS 10,000')).toBeInTheDocument() // saloon sales today
    expect(screen.getByText('TZS 7,500')).toBeInTheDocument()  // saloon profit today (75%)
  })
})
```

- [ ] **Step 2: Run the test to verify the new test fails**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: the original "renders loading state initially" test still PASSes; the new "Saloon Center section" test FAILs — no Saloon Center section rendered yet.

- [ ] **Step 3: Update the API client type**

In `frontend/src/api/dashboard.ts`, add to `AdminDashboard` (after `store_asset_value`):
```ts
  saloon: {
    sales: {
      today: string
      today_by_shop: ShopBreakdown[]
      this_month: string
      this_month_by_shop: ShopBreakdown[]
    }
    profit: {
      today: string
      today_by_shop: ShopBreakdown[]
      this_month: string
      this_month_by_shop: ShopBreakdown[]
    }
    expenses: {
      this_month: string
      this_month_by_shop: ShopBreakdown[]
    }
    asset_value: {
      total: string
      by_shop: ShopBreakdown[]
    }
  }
```

- [ ] **Step 4: Update `DashboardPage.tsx`**

In the admin dashboard block (`{dashData?.role === 'admin' && ( ... )}`), immediately after the closing `</div>` of the "Simple count cards (3 col)" grid (currently ending the `<div className="space-y-4">` block around line 139), add:
```tsx
          <h2 className="mt-2 text-sm font-semibold text-gray-700">Saloon Center</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BreakdownCard
              label="Sales Today"
              total={dashData.saloon.sales.today}
              shops={dashData.saloon.sales.today_by_shop}
            />
            <BreakdownCard
              label="Sales This Month"
              total={dashData.saloon.sales.this_month}
              shops={dashData.saloon.sales.this_month_by_shop}
            />
            <BreakdownCard
              label="Profit Today"
              total={dashData.saloon.profit.today}
              shops={dashData.saloon.profit.today_by_shop}
              colorNegative
            />
            <BreakdownCard
              label="Profit This Month"
              total={dashData.saloon.profit.this_month}
              shops={dashData.saloon.profit.this_month_by_shop}
              colorNegative
            />
            <BreakdownCard
              label="Expenses This Month"
              total={dashData.saloon.expenses.this_month}
              shops={dashData.saloon.expenses.this_month_by_shop}
            />
            <BreakdownCard
              label="Asset Value"
              total={dashData.saloon.asset_value.total}
              shops={dashData.saloon.asset_value.by_shop}
            />
          </div>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full frontend suite and type-check**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/dashboard.ts frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.test.tsx
git commit -m "feat(saloon-center): add Saloon Center section to admin dashboard"
```

---

### Task 14: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the backend and frontend dev servers**

```bash
cd backend && "/c/laragon/bin/php/php-8.4.12-nts-Win32-vs17-x64/php.exe" artisan serve --port=8001
cd frontend && npm run dev -- --port 5173
```

- [ ] **Step 2: Set up test data as admin**

- Log in as admin. Go to Settings → Providers, add a provider (e.g. "Jane Doe", "0712345678").
- Go to Settings → Saloon Services, add "Kuosha" and "Kusuka na Kupaka Dawa".
- Go to Settings → Saloon Tools, log a purchase (pick a shop, "Hair Dryer", quantity 2, unit cost 50000) — confirm it appears in the list and the total shows 100,000.

- [ ] **Step 3: Log a saloon sale**

- Go to Saloon Center (sidebar link right after Reconciliation). Click "Log Sale".
- As admin: confirm the Shop selector appears and is required.
- Fill in shop, provider, service, an amount (e.g. 20000), submit. Confirm the new row appears in the list with the correct date/provider/service/amount/shop.
- Log in as a seller instead (or switch role if your test account supports it) and confirm: no Shop selector appears (auto-scoped to their own shop), and the sale still logs correctly.

- [ ] **Step 4: Verify the dashboard**

- Go to Dashboard as admin. Confirm a "Saloon Center" heading appears below the existing cards, with 6 cards: Sales Today, Sales This Month, Profit Today, Profit This Month, Expenses This Month, Asset Value.
- Confirm Profit Today = 75% of Sales Today (e.g. if Sales Today shows TZS 20,000, Profit Today should show TZS 15,000).
- Confirm Asset Value reflects the tool purchase logged in Step 2 (100,000, or more if other tools exist).
- Go to Expenses, log an expense with Business Line = "Saloon Center". Confirm it does NOT change the existing Store "Expenses This Month" card, and DOES appear in the new Saloon Center "Expenses This Month" card after refreshing the dashboard.

- [ ] **Step 5: Verify role restrictions**

- Log in as store_keeper: confirm Saloon Center is visible in the sidebar and the list loads, but there's no "Log Sale" button.
- Confirm store_keeper cannot reach `/saloon-tools`, `/providers`, or `/saloon-services` (no sidebar entries for these roles; direct navigation should redirect to `/` via `RoleRoute`).

- [ ] **Step 6: Report results**

Note any visual or behavioral issues found; fix before proceeding if anything is broken.

---

### Task 15: Push to `develop`

**Files:** none (git operation only)

- [ ] **Step 1: Push the commits**

```bash
git push origin develop
```

- [ ] **Step 2: Verify Railway deploy**

Check the Railway dashboard (or `railway logs` if the CLI is linked) to confirm the deploy triggered by this push completes successfully — this push includes 6 new migrations (5 new tables/columns + 1 RLS migration), so specifically confirm the migration step in the deploy log succeeds with no errors before considering this done.
