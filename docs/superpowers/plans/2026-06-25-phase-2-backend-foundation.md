# Phase 2: Backend Foundation & DB Connections

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the PostgreSQL dual-role RLS foundation, wire the SetDbSessionContext middleware, set up Sanctum bearer-token auth with Login/Logout/Me endpoints, and configure spatie/laravel-permission with the three application roles.

**Architecture:** Two PostgreSQL roles (`hairbeauty_owner` BYPASSRLS for migrations, `hairbeauty_app` NOBYPASSRLS for web requests) are configured as dual Laravel DB connections. Every API request runs `set_config()` to set `app.user_id`, `app.role`, and `app.location_ids` GUCs — the values Phase 3 RLS policies will enforce. Sanctum bearer tokens (not cookies) authenticate users; spatie/laravel-permission holds role definitions that Phase 4 policies will check.

**Tech Stack:** PHP 8.4 / Laravel 12 / Sanctum 4.3 / spatie/laravel-permission 7.4 / PostgreSQL 17 / Pest 4

## Global Constraints

- PHP binary: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe` (system PATH has PHP 7.4 — always use full path)
- Composer: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe C:\ProgramData\ComposerSetup\bin\composer.phar`
- All `php artisan` commands run from the `backend/` directory
- All Pest runs: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage`
- All Pint runs: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint <file>` — run on every file you modify before committing
- PHPStan: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M`
- DB roles: `hairbeauty_owner` (BYPASSRLS, owns tables, runs migrations) + `hairbeauty_app` (NOBYPASSRLS, web requests)
- Auth: Sanctum bearer tokens only — no cookie-based SPA auth, `supports_credentials: false`
- Default auth guard: `sanctum` (set via `AUTH_GUARD=sanctum` in .env — config/auth.php already reads this env var)
- Three roles exactly: `admin`, `store_keeper`, `seller`
- GUC names: `app.user_id` (string of int), `app.role` (string), `app.location_ids` (JSON array string)
- `users.location_id` is a plain `unsigned bigint nullable` — NO foreign key yet (FK added in Phase 3 when locations table exists)
- Pint-formatted but uncommitted Phase 1 files: `app/Models/User.php`, `bootstrap/providers.php`, `config/auth.php`, `database/factories/UserFactory.php` — include them in the commit of whichever task first modifies them

---

## Task 1: PostgreSQL dual-role setup + dual DB connections

**Files:**
- Create: `backend/database/setup/postgresql-roles.sql` (one-time DBA script; never run by artisan)
- Modify: `backend/config/database.php` (add `pgsql_owner` connection; set `migrations.connection`)
- Modify: `backend/.env.example` (add `AUTH_GUARD`, `DB_OWNER_USERNAME`, `DB_OWNER_PASSWORD`)
- Modify: `backend/.env` (local owner + app credentials)
- Test: `backend/tests/Feature/HealthCheckTest.php` (already passing — re-run to confirm no regression after DB config change)

**Interfaces:**
- Produces: `pgsql_owner` connection name + `pgsql` app connection — consumed by Tasks 2–5 (migrations use owner; Eloquent uses app)

- [ ] **Step 1: Create `backend/database/setup/postgresql-roles.sql`**

  Run this once as the PostgreSQL superuser (`postgres`) in Laragon's psql or pgAdmin. This file is documentation + a replayable script — it is **not** executed by artisan.

  ```sql
  -- Run as postgres superuser
  -- Step A: create roles
  CREATE ROLE hairbeauty_owner
      WITH LOGIN
           PASSWORD 'owner_secret'
           CREATEROLE
           CREATEDB
           BYPASSRLS;

  CREATE ROLE hairbeauty_app
      WITH LOGIN
           PASSWORD 'app_secret'
           NOBYPASSRLS;

  -- Step B: create database
  CREATE DATABASE hairbeauty OWNER hairbeauty_owner;

  -- Step C: connect to the new database and grant app-role access
  \connect hairbeauty

  GRANT CONNECT ON DATABASE hairbeauty TO hairbeauty_app;
  GRANT USAGE  ON SCHEMA public TO hairbeauty_app;

  -- All tables created by hairbeauty_owner automatically inherit these grants
  ALTER DEFAULT PRIVILEGES FOR ROLE hairbeauty_owner IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hairbeauty_app;

  ALTER DEFAULT PRIVILEGES FOR ROLE hairbeauty_owner IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO hairbeauty_app;
  ```

  **Run it now in Laragon's psql:**
  ```
  psql -U postgres -f "backend/database/setup/postgresql-roles.sql"
  ```

  Expected: no errors, `CREATE ROLE`, `CREATE DATABASE`, `GRANT` lines printed.

- [ ] **Step 2: Add `pgsql_owner` connection to `backend/config/database.php`**

  In the `connections` array, after the existing `pgsql` block, add:

  ```php
  'pgsql_owner' => [
      'driver'         => 'pgsql',
      'host'           => env('DB_HOST', '127.0.0.1'),
      'port'           => env('DB_PORT', '5432'),
      'database'       => env('DB_DATABASE', 'hairbeauty'),
      'username'       => env('DB_OWNER_USERNAME', 'hairbeauty_owner'),
      'password'       => env('DB_OWNER_PASSWORD', ''),
      'charset'        => 'utf8',
      'prefix'         => '',
      'prefix_indexes' => true,
      'search_path'    => 'public',
      'sslmode'        => 'prefer',
  ],
  ```

  Then update the `migrations` key at the bottom of the file:

  ```php
  'migrations' => [
      'table'                => 'migrations',
      'update_date_on_publish' => true,
      'connection'           => 'pgsql_owner',
  ],
  ```

  Also change the `default` key (line ~19) to confirm it reads from env correctly — no code change needed, just verify:
  ```php
  'default' => env('DB_CONNECTION', 'pgsql'),
  ```

- [ ] **Step 3: Update `backend/.env.example`**

  Replace the DB section with the dual-role layout:

  ```dotenv
  DB_CONNECTION=pgsql
  DB_HOST=127.0.0.1
  DB_PORT=5432
  DB_DATABASE=hairbeauty
  DB_USERNAME=hairbeauty_app
  DB_PASSWORD=

  DB_OWNER_USERNAME=hairbeauty_owner
  DB_OWNER_PASSWORD=

  AUTH_GUARD=sanctum
  ```

  Add `AUTH_GUARD=sanctum` to the existing AUTH section too. Leave all other keys from Phase 1 as-is.

- [ ] **Step 4: Update `backend/.env` with local credentials**

  Update these keys (do NOT change APP_KEY):

  ```dotenv
  DB_USERNAME=hairbeauty_app
  DB_PASSWORD=app_secret
  DB_OWNER_USERNAME=hairbeauty_owner
  DB_OWNER_PASSWORD=owner_secret
  AUTH_GUARD=sanctum
  ```

  Replace `app_secret` and `owner_secret` with the actual passwords you used in Step 1.

- [ ] **Step 5: Run `php artisan config:clear` and verify both connections work**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan config:clear
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan db:show --database=pgsql
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan db:show --database=pgsql_owner
  ```

  Expected: both connections report `Connected` to the `hairbeauty` database with their respective usernames.

- [ ] **Step 6: Run the existing Pest tests — confirm no regression**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/HealthCheckTest.php
  ```

  Expected:
  ```
  PASS  Tests\Feature\HealthCheckTest
  ✓ health endpoint returns ok
  ✓ api ping returns ok json
  ```

- [ ] **Step 7: Run Pint on modified files**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint config/database.php
  ```

- [ ] **Step 8: Commit**

  ```bash
  cd ..
  git add backend/database/setup/postgresql-roles.sql \
          backend/config/database.php \
          backend/.env.example
  git commit -m "feat(backend): PostgreSQL dual-role setup, pgsql_owner connection, migrations.connection"
  ```

---

## Task 2: Users migration + Sanctum setup + User model

**Files:**
- Modify: `backend/database/migrations/0001_01_01_000000_create_users_table.php` (add `role`, `location_id`, `is_active`)
- Run: `php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"` (creates `config/sanctum.php` + PAT migration)
- Modify: `backend/config/sanctum.php` (set expiration to null — tokens don't expire)
- Modify: `backend/app/Models/User.php` (add `HasApiTokens`, update `fillable`/`hidden`/`casts`)
- Run: `php artisan migrate` (creates all tables)
- Test: `backend/tests/Feature/UserModelTest.php`

**Interfaces:**
- Produces: `User::$fillable` includes `role`, `location_id`, `is_active`; `User->createToken()` available — consumed by Tasks 4 and 5

- [ ] **Step 1: Write failing test in `backend/tests/Feature/UserModelTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Laravel\Sanctum\PersonalAccessToken;

  it('stores role, location_id, and is_active on users', function () {
      $user = User::factory()->create([
          'role'        => 'admin',
          'location_id' => null,
          'is_active'   => true,
      ]);

      expect($user->fresh())
          ->role->toBe('admin')
          ->location_id->toBeNull()
          ->is_active->toBeTrue();
  });

  it('can create a sanctum bearer token', function () {
      $user = User::factory()->create();
      $token = $user->createToken('test');

      expect($token->plainTextToken)->toBeString()->not->toBeEmpty();
      expect(PersonalAccessToken::count())->toBe(1);
  });
  ```

- [ ] **Step 2: Run test — expect FAIL (columns don't exist yet)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/UserModelTest.php
  ```

  Expected: FAIL — `Column not found: 1054 Unknown column 'role'` (or similar missing-column error on first create).

- [ ] **Step 3: Modify `backend/database/migrations/0001_01_01_000000_create_users_table.php`**

  Replace the `up()` body. Keep the existing `password_reset_tokens` and `sessions` tables as-is; only extend the `users` table:

  ```php
  public function up(): void
  {
      Schema::create('users', function (Blueprint $table) {
          $table->id();
          $table->string('name');
          $table->string('email')->unique();
          $table->string('password');
          $table->enum('role', ['admin', 'store_keeper', 'seller'])->default('seller');
          $table->unsignedBigInteger('location_id')->nullable(); // FK added Phase 3
          $table->boolean('is_active')->default(true);
          $table->timestamp('email_verified_at')->nullable();
          $table->rememberToken();
          $table->timestamps();
      });

      Schema::create('password_reset_tokens', function (Blueprint $table) {
          $table->string('email')->primary();
          $table->string('token');
          $table->timestamp('created_at')->nullable();
      });

      Schema::create('sessions', function (Blueprint $table) {
          $table->string('id')->primary();
          $table->foreignId('user_id')->nullable()->index();
          $table->string('ip_address', 45)->nullable();
          $table->text('user_agent')->nullable();
          $table->longText('payload');
          $table->integer('last_activity')->index();
      });
  }
  ```

  The `down()` method stays unchanged.

- [ ] **Step 4: Publish Sanctum**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
  ```

  Expected output: `Publishing [sanctum-config] assets` and `Publishing [sanctum-migrations] assets` — two files published.

- [ ] **Step 5: Configure `backend/config/sanctum.php`**

  Set the expiration to null (tokens do not expire — revoked explicitly on logout):

  Find this line:
  ```php
  'expiration' => null,
  ```
  It is already `null` by default in Sanctum 4.x. Verify and leave as-is.

  Set the stateful domains to an empty array (no cookie auth):
  ```php
  'stateful' => [],
  ```

- [ ] **Step 6: Update `backend/app/Models/User.php`**

  Full file replacement (also includes the Pint-formatted version of this file from Phase 1):

  ```php
  <?php

  namespace App\Models;

  use Database\Factories\UserFactory;
  use Illuminate\Database\Eloquent\Factories\HasFactory;
  use Illuminate\Foundation\Auth\User as Authenticatable;
  use Illuminate\Notifications\Notifiable;
  use Laravel\Sanctum\HasApiTokens;

  class User extends Authenticatable
  {
      /** @use HasFactory<UserFactory> */
      use HasApiTokens, HasFactory, Notifiable;

      protected $fillable = [
          'name',
          'email',
          'password',
          'role',
          'location_id',
          'is_active',
      ];

      protected $hidden = [
          'password',
          'remember_token',
      ];

      protected function casts(): array
      {
          return [
              'email_verified_at' => 'datetime',
              'password'          => 'hashed',
              'is_active'         => 'boolean',
              'location_id'       => 'integer',
          ];
      }
  }
  ```

- [ ] **Step 7: Update `backend/database/factories/UserFactory.php`** (also commits Pint-formatted version)

  ```php
  <?php

  namespace Database\Factories;

  use App\Models\User;
  use Illuminate\Database\Eloquent\Factories\Factory;
  use Illuminate\Support\Facades\Hash;
  use Illuminate\Support\Str;

  /**
   * @extends Factory<User>
   */
  class UserFactory extends Factory
  {
      protected static ?string $password;

      public function definition(): array
      {
          return [
              'name'               => fake()->name(),
              'email'              => fake()->unique()->safeEmail(),
              'password'           => static::$password ??= Hash::make('password'),
              'role'               => 'seller',
              'location_id'        => null,
              'is_active'          => true,
              'email_verified_at'  => now(),
              'remember_token'     => Str::random(10),
          ];
      }

      public function admin(): static
      {
          return $this->state(['role' => 'admin', 'location_id' => null]);
      }

      public function storeKeeper(): static
      {
          return $this->state(['role' => 'store_keeper']);
      }

      public function seller(): static
      {
          return $this->state(['role' => 'seller']);
      }

      public function inactive(): static
      {
          return $this->state(['is_active' => false]);
      }

      public function unverified(): static
      {
          return $this->state(['email_verified_at' => null]);
      }
  }
  ```

- [ ] **Step 8: Run migrations (creates all tables via owner connection)**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  ```

  Expected: migrations run as `hairbeauty_owner`; tables `users`, `password_reset_tokens`, `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `personal_access_tokens` created.

- [ ] **Step 9: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/UserModelTest.php
  ```

  Expected:
  ```
  PASS  Tests\Feature\UserModelTest
  ✓ stores role, location_id, and is_active on users
  ✓ can create a sanctum bearer token
  ```

- [ ] **Step 10: Run full suite — no regressions**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  ```

  Expected: all prior tests still pass + 2 new ones.

- [ ] **Step 11: Run Pint on all modified files**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint \
      database/migrations/0001_01_01_000000_create_users_table.php \
      config/sanctum.php \
      app/Models/User.php \
      database/factories/UserFactory.php
  ```

- [ ] **Step 12: Commit**

  ```bash
  cd ..
  git add backend/database/migrations/0001_01_01_000000_create_users_table.php \
          backend/config/sanctum.php \
          backend/app/Models/User.php \
          backend/database/factories/UserFactory.php \
          backend/database/migrations/*_create_personal_access_tokens_table.php \
          backend/tests/Feature/UserModelTest.php
  git commit -m "feat(backend): extend users table with role/location_id/is_active, add Sanctum PAT"
  ```

---

## Task 3: spatie/laravel-permission setup + RoleSeeder

**Files:**
- Run: `php artisan vendor:publish --provider="Spatie\Permission\PermissionServiceProvider"` (creates `config/permission.php` + permission tables migration)
- Modify: `backend/config/permission.php` (set guard to `sanctum`, disable teams)
- Modify: `backend/app/Models/User.php` (add `HasRoles` trait)
- Create: `backend/database/seeders/RoleSeeder.php`
- Modify: `backend/database/seeders/DatabaseSeeder.php`
- Test: `backend/tests/Feature/RoleSeederTest.php`

**Interfaces:**
- Produces: `Role` model with names `admin`, `store_keeper`, `seller` (guard_name = `sanctum`) — consumed by Task 5 tests and Phase 4 permission checks

- [ ] **Step 1: Write failing test in `backend/tests/Feature/RoleSeederTest.php`**

  ```php
  <?php

  use Database\Seeders\RoleSeeder;
  use Spatie\Permission\Models\Role;

  it('seeds the three application roles with sanctum guard', function () {
      $this->seed(RoleSeeder::class);

      expect(Role::where('guard_name', 'sanctum')->pluck('name')->sort()->values()->all())
          ->toBe(['admin', 'seller', 'store_keeper']);
  });

  it('is idempotent — seeding twice does not duplicate roles', function () {
      $this->seed(RoleSeeder::class);
      $this->seed(RoleSeeder::class);

      expect(Role::where('guard_name', 'sanctum')->count())->toBe(3);
  });
  ```

- [ ] **Step 2: Run test — expect FAIL (RoleSeeder class not found)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/RoleSeederTest.php
  ```

  Expected: FAIL — `Class "Database\Seeders\RoleSeeder" not found`.

- [ ] **Step 3: Publish spatie/laravel-permission**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan vendor:publish --provider="Spatie\Permission\PermissionServiceProvider"
  ```

  Expected: `config/permission.php` and a migration file `..._create_permission_tables.php` published.

- [ ] **Step 4: Configure `backend/config/permission.php` — set guard to sanctum, disable teams**

  Find these two keys and update them:

  ```php
  // Change 'guard_name' default to 'sanctum'
  // This is used when guard is not specified on Role/Permission creation
  ```

  The file does not have a simple `'guard_name'` key. Instead, update the `'models'` section:
  There is no direct guard_name key — guard is passed at creation time. Leave the models as-is.

  The key change is in `'teams'`:
  ```php
  'teams' => false,
  ```
  Verify it is `false` (it is false by default). Leave it.

  The `'column_names' => ['team_foreign_key' => 'team_id']` section can stay as-is.

  **Important:** In the `'cache'` section, verify:
  ```php
  'store' => 'default',
  ```
  Leave as-is (uses the default cache store which is `database` per our .env).

- [ ] **Step 5: Add `HasRoles` to `backend/app/Models/User.php`**

  Add the trait and import:

  ```php
  <?php

  namespace App\Models;

  use Database\Factories\UserFactory;
  use Illuminate\Database\Eloquent\Factories\HasFactory;
  use Illuminate\Foundation\Auth\User as Authenticatable;
  use Illuminate\Notifications\Notifiable;
  use Laravel\Sanctum\HasApiTokens;
  use Spatie\Permission\Traits\HasRoles;

  class User extends Authenticatable
  {
      /** @use HasFactory<UserFactory> */
      use HasApiTokens, HasFactory, HasRoles, Notifiable;

      protected $fillable = [
          'name',
          'email',
          'password',
          'role',
          'location_id',
          'is_active',
      ];

      protected $hidden = [
          'password',
          'remember_token',
      ];

      protected function casts(): array
      {
          return [
              'email_verified_at' => 'datetime',
              'password'          => 'hashed',
              'is_active'         => 'boolean',
              'location_id'       => 'integer',
          ];
      }
  }
  ```

- [ ] **Step 6: Run the permission migration**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  ```

  Expected: `..._create_permission_tables` migration runs, tables `permissions`, `roles`, `model_has_permissions`, `model_has_roles`, `role_has_permissions` created.

- [ ] **Step 7: Create `backend/database/seeders/RoleSeeder.php`**

  ```php
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
                  'name'       => $name,
                  'guard_name' => 'sanctum',
              ]);
          }
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
          ]);
      }
  }
  ```

- [ ] **Step 9: Run the seeder manually to verify**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan db:seed --class=RoleSeeder
  ```

  Expected: no errors, three roles inserted.

- [ ] **Step 10: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/RoleSeederTest.php
  ```

  Expected:
  ```
  PASS  Tests\Feature\RoleSeederTest
  ✓ seeds the three application roles with sanctum guard
  ✓ is idempotent — seeding twice does not duplicate roles
  ```

  If you see a `spatie/permission` cache error, run:
  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan permission:cache-reset
  ```

- [ ] **Step 11: Run full suite — all green**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  ```

- [ ] **Step 12: Run Pint on modified files**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint \
      config/permission.php \
      app/Models/User.php \
      database/seeders/RoleSeeder.php \
      database/seeders/DatabaseSeeder.php
  ```

- [ ] **Step 13: Commit**

  ```bash
  cd ..
  git add backend/config/permission.php \
          backend/app/Models/User.php \
          backend/database/migrations/*_create_permission_tables.php \
          backend/database/seeders/RoleSeeder.php \
          backend/database/seeders/DatabaseSeeder.php \
          backend/tests/Feature/RoleSeederTest.php
  git commit -m "feat(backend): add spatie/permission, seed admin/store_keeper/seller roles (sanctum guard)"
  ```

---

## Task 4: SetDbSessionContext middleware — full implementation

**Files:**
- Modify: `backend/app/Http/Middleware/SetDbSessionContext.php` (full GUC implementation)
- Test: `backend/tests/Feature/SetDbSessionContextTest.php`

**Interfaces:**
- Consumes: `Auth::guard('sanctum')->user()` → `User` with `id`, `role`, `location_id`
- Produces: PostgreSQL GUCs `app.user_id` (string int), `app.role` (string), `app.location_ids` (JSON array string) — consumed by Phase 3 RLS policies

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/SetDbSessionContextTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Illuminate\Support\Facades\Route;
  use Laravel\Sanctum\Sanctum;

  // Register a test-only route to inspect GUC values mid-request
  beforeEach(function () {
      Route::middleware('api')->get('/_test/guc', function () {
          return response()->json([
              'user_id'      => DB::selectOne("SELECT current_setting('app.user_id', true) AS v")->v,
              'role'         => DB::selectOne("SELECT current_setting('app.role', true) AS v")->v,
              'location_ids' => DB::selectOne("SELECT current_setting('app.location_ids', true) AS v")->v,
          ]);
      });
  });

  it('sets guest GUCs for unauthenticated requests', function () {
      $this->getJson('/_test/guc')
          ->assertOk()
          ->assertJsonPath('user_id', '0')
          ->assertJsonPath('role', 'guest')
          ->assertJsonPath('location_ids', '[]');
  });

  it('sets user GUCs for an authenticated admin with no location', function () {
      $user = User::factory()->admin()->create();
      Sanctum::actingAs($user);

      $this->getJson('/_test/guc')
          ->assertOk()
          ->assertJsonPath('user_id', (string) $user->id)
          ->assertJsonPath('role', 'admin')
          ->assertJsonPath('location_ids', '[]');
  });

  it('sets location_ids GUC for a seller with a location', function () {
      $user = User::factory()->seller()->create(['location_id' => 3]);
      Sanctum::actingAs($user);

      $this->getJson('/_test/guc')
          ->assertOk()
          ->assertJsonPath('user_id', (string) $user->id)
          ->assertJsonPath('role', 'seller')
          ->assertJsonPath('location_ids', json_encode([3]));
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL (middleware is still the stub)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/SetDbSessionContextTest.php
  ```

  Expected: FAIL — the unauthenticated test returns empty strings `''` (not `'0'`/`'guest'`/`'[]'`) because the stub doesn't set GUCs.

- [ ] **Step 3: Implement `backend/app/Http/Middleware/SetDbSessionContext.php`**

  ```php
  <?php

  namespace App\Http\Middleware;

  use Closure;
  use Illuminate\Http\Request;
  use Illuminate\Support\Facades\Auth;
  use Illuminate\Support\Facades\DB;
  use Symfony\Component\HttpFoundation\Response;

  class SetDbSessionContext
  {
      public function handle(Request $request, Closure $next): Response
      {
          $user = Auth::guard('sanctum')->user();

          $userId      = (string) ($user?->id ?? 0);
          $role        = $user?->role ?? 'guest';
          $locationIds = $user?->location_id !== null
              ? json_encode([$user->location_id])
              : '[]';

          try {
              DB::statement('SELECT set_config(?, ?, false)', ['app.user_id', $userId]);
              DB::statement('SELECT set_config(?, ?, false)', ['app.role', $role]);
              DB::statement('SELECT set_config(?, ?, false)', ['app.location_ids', $locationIds]);

              return $next($request);
          } finally {
              try {
                  DB::unprepared("RESET app.user_id");
                  DB::unprepared("RESET app.role");
                  DB::unprepared("RESET app.location_ids");
              } catch (\Throwable) {
                  // Connection may be closed or in error state
              }
          }
      }
  }
  ```

- [ ] **Step 4: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/SetDbSessionContextTest.php
  ```

  Expected:
  ```
  PASS  Tests\Feature\SetDbSessionContextTest
  ✓ sets guest GUCs for unauthenticated requests
  ✓ sets user GUCs for an authenticated admin with no location
  ✓ sets location_ids GUC for a seller with a location
  ```

- [ ] **Step 5: Run full suite — all green**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  ```

- [ ] **Step 6: Run Pint**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/Http/Middleware/SetDbSessionContext.php
  ```

- [ ] **Step 7: Commit**

  ```bash
  cd ..
  git add backend/app/Http/Middleware/SetDbSessionContext.php \
          backend/tests/Feature/SetDbSessionContextTest.php
  git commit -m "feat(backend): implement SetDbSessionContext — set app.* GUCs per request via set_config()"
  ```

---

## Task 5: Auth controllers + routes (Login, Logout, Me)

**Files:**
- Create: `backend/app/Http/Controllers/Api/V1/Auth/LoginController.php`
- Create: `backend/app/Http/Controllers/Api/V1/Auth/LogoutController.php`
- Create: `backend/app/Http/Controllers/Api/V1/Auth/MeController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Auth/AuthTest.php`

**Interfaces:**
- Consumes: `User::factory()` states from Task 2; `Sanctum::actingAs()` from laravel/sanctum
- Produces:
  - `POST /api/v1/auth/login` → `{"data": {"token": "...", "user": {...}}}` | 422 on bad creds | 422 on inactive user
  - `GET /api/v1/auth/me` (auth:sanctum) → `{"data": {"id", "name", "email", "role", "location_id", "is_active"}}` | 401 unauthenticated
  - `POST /api/v1/auth/logout` (auth:sanctum) → `{"message": "Logged out successfully"}` | 401 unauthenticated

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Auth/AuthTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\Hash;
  use Laravel\Sanctum\Sanctum;

  it('issues a bearer token on valid credentials', function () {
      User::factory()->create([
          'email'    => 'admin@example.com',
          'password' => Hash::make('password'),
          'role'     => 'admin',
          'is_active' => true,
      ]);

      $this->postJson('/api/v1/auth/login', [
          'email'    => 'admin@example.com',
          'password' => 'password',
      ])
          ->assertOk()
          ->assertJsonStructure([
              'data' => [
                  'token',
                  'user' => ['id', 'name', 'email', 'role', 'location_id', 'is_active'],
              ],
          ]);
  });

  it('returns 422 for invalid credentials', function () {
      User::factory()->create(['email' => 'user@example.com']);

      $this->postJson('/api/v1/auth/login', [
          'email'    => 'user@example.com',
          'password' => 'wrong',
      ])->assertUnprocessable();
  });

  it('returns 422 for inactive users', function () {
      User::factory()->inactive()->create([
          'email'    => 'inactive@example.com',
          'password' => Hash::make('password'),
      ]);

      $this->postJson('/api/v1/auth/login', [
          'email'    => 'inactive@example.com',
          'password' => 'password',
      ])->assertUnprocessable();
  });

  it('returns the authenticated user on GET /me', function () {
      $user = User::factory()->seller()->create(['location_id' => 2]);
      Sanctum::actingAs($user);

      $this->getJson('/api/v1/auth/me')
          ->assertOk()
          ->assertJsonPath('data.id', $user->id)
          ->assertJsonPath('data.role', 'seller')
          ->assertJsonPath('data.location_id', 2)
          ->assertJsonPath('data.is_active', true);
  });

  it('returns 401 for unauthenticated GET /me', function () {
      $this->getJson('/api/v1/auth/me')->assertUnauthorized();
  });

  it('revokes the current token on POST /logout', function () {
      $user = User::factory()->create();
      Sanctum::actingAs($user);

      $this->postJson('/api/v1/auth/logout')->assertOk()
          ->assertJsonPath('message', 'Logged out successfully');

      expect($user->tokens()->count())->toBe(0);
  });

  it('returns 401 for unauthenticated POST /logout', function () {
      $this->postJson('/api/v1/auth/logout')->assertUnauthorized();
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL (routes don't exist)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Auth/AuthTest.php
  ```

  Expected: FAIL — `404 Not Found` on all requests (routes not defined yet).

- [ ] **Step 3: Create `backend/app/Http/Controllers/Api/V1/Auth/LoginController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1\Auth;

  use App\Http\Controllers\Controller;
  use App\Models\User;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Http\Request;
  use Illuminate\Support\Facades\Hash;
  use Illuminate\Validation\ValidationException;

  class LoginController extends Controller
  {
      public function __invoke(Request $request): JsonResponse
      {
          $validated = $request->validate([
              'email'    => ['required', 'email'],
              'password' => ['required', 'string'],
          ]);

          $user = User::where('email', $validated['email'])->first();

          if (! $user || ! Hash::check($validated['password'], $user->password)) {
              throw ValidationException::withMessages([
                  'email' => ['The provided credentials are incorrect.'],
              ]);
          }

          if (! $user->is_active) {
              throw ValidationException::withMessages([
                  'email' => ['Your account has been deactivated.'],
              ]);
          }

          $token = $user->createToken('api')->plainTextToken;

          return response()->json([
              'data' => [
                  'token' => $token,
                  'user'  => $user->only(['id', 'name', 'email', 'role', 'location_id', 'is_active']),
              ],
          ]);
      }
  }
  ```

- [ ] **Step 4: Create `backend/app/Http/Controllers/Api/V1/Auth/LogoutController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1\Auth;

  use App\Http\Controllers\Controller;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Http\Request;

  class LogoutController extends Controller
  {
      public function __invoke(Request $request): JsonResponse
      {
          $request->user()->currentAccessToken()->delete();

          return response()->json(['message' => 'Logged out successfully']);
      }
  }
  ```

- [ ] **Step 5: Create `backend/app/Http/Controllers/Api/V1/Auth/MeController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1\Auth;

  use App\Http\Controllers\Controller;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Http\Request;

  class MeController extends Controller
  {
      public function __invoke(Request $request): JsonResponse
      {
          return response()->json([
              'data' => $request->user()->only([
                  'id', 'name', 'email', 'role', 'location_id', 'is_active',
              ]),
          ]);
      }
  }
  ```

- [ ] **Step 6: Update `backend/routes/api.php`**

  ```php
  <?php

  use App\Http\Controllers\Api\V1\Auth\LoginController;
  use App\Http\Controllers\Api\V1\Auth\LogoutController;
  use App\Http\Controllers\Api\V1\Auth\MeController;
  use Illuminate\Support\Facades\Route;

  Route::prefix('v1')->name('v1.')->group(function () {
      Route::get('/ping', fn () => response()->json(['status' => 'ok']))->name('ping');

      Route::prefix('auth')->name('auth.')->group(function () {
          Route::post('/login', LoginController::class)->name('login');

          Route::middleware('auth:sanctum')->group(function () {
              Route::post('/logout', LogoutController::class)->name('logout');
              Route::get('/me', MeController::class)->name('me');
          });
      });

      // Catalogue — Phase 4
      // Inventory — Phase 4
  });
  ```

- [ ] **Step 7: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Auth/AuthTest.php
  ```

  Expected:
  ```
  PASS  Tests\Feature\Auth\AuthTest
  ✓ issues a bearer token on valid credentials
  ✓ returns 422 for invalid credentials
  ✓ returns 422 for inactive users
  ✓ returns the authenticated user on GET /me
  ✓ returns 401 for unauthenticated GET /me
  ✓ revokes the current token on POST /logout
  ✓ returns 401 for unauthenticated POST /logout
  ```

- [ ] **Step 8: Run full suite — all green**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  ```

  Expected: all tests pass (prior 7 + 7 new = 14+ total).

- [ ] **Step 9: Run PHPStan — no errors**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  ```

  Expected: `[OK] No errors`.

- [ ] **Step 10: Run Pint on all modified files**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint \
      app/Http/Controllers/Api/V1/Auth/LoginController.php \
      app/Http/Controllers/Api/V1/Auth/LogoutController.php \
      app/Http/Controllers/Api/V1/Auth/MeController.php \
      routes/api.php
  ```

- [ ] **Step 11: Update progress ledger**

  Update `.superpowers/sdd/progress.md`: mark all Phase 2 steps complete and add Phase 3 stub.

  Replace the Phase 2 section with:
  ```markdown
  ## Phase 2: Backend foundation & DB connections — COMPLETE ✓

  - [x] Task 1: PostgreSQL dual-role setup + pgsql_owner connection + migrations.connection
  - [x] Task 2: Users migration (role/location_id/is_active) + Sanctum PAT setup + User model
  - [x] Task 3: spatie/laravel-permission + RoleSeeder (admin, store_keeper, seller — sanctum guard)
  - [x] Task 4: SetDbSessionContext — full set_config() GUC implementation + RESET in finally
  - [x] Task 5: Auth controllers (Login/Logout/Me) + /api/v1/auth/* routes

  ## Phase 3: Database schema — migrations, functions, triggers, views, RLS policies

  - [ ] Step 3.1: Core tables (locations, products, categories, batches)
  - [ ] Step 3.2: Inventory tables (stock_movements ledger, per-location stock)
  - [ ] Step 3.3: Sales tables (sales, sale_items, clients)
  - [ ] Step 3.4: Supporting tables (expenses, news, attendance, distributions)
  - [ ] Step 3.5: PostgreSQL functions + triggers (stock calc, audit)
  - [ ] Step 3.6: RLS policies — enable RLS + policies per table using app.* GUCs
  - [ ] Step 3.7: Views (current_stock_by_location, low_stock_alerts, etc.)
  ```

- [ ] **Step 12: Commit**

  ```bash
  cd ..
  git add backend/app/Http/Controllers/Api/V1/Auth/ \
          backend/routes/api.php \
          backend/tests/Feature/Auth/AuthTest.php \
          .superpowers/sdd/progress.md
  git commit -m "feat(backend): auth controllers Login/Logout/Me with Sanctum bearer tokens"
  ```

- [ ] **Step 13: Merge to master and cut Phase 3 branch**

  ```bash
  git checkout master
  git merge --no-ff feature/phase-2-backend-foundation \
      -m "feat: complete Phase 2 — PostgreSQL dual roles, GUC middleware, Sanctum auth, RBAC seeder"
  git checkout -b feature/phase-3-database-schema
  ```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| PostgreSQL dual roles (hairbeauty_owner BYPASSRLS, hairbeauty_app NOBYPASSRLS) | Task 1 SQL script + pgsql_owner connection |
| Migrations run as hairbeauty_owner | Task 1 migrations.connection = pgsql_owner |
| `app.user_id`, `app.role`, `app.location_ids` GUCs set per request | Task 4 SetDbSessionContext |
| GUCs RESET in finally block | Task 4 SetDbSessionContext |
| Sanctum bearer tokens (no cookies) | Task 2 Sanctum config; `supports_credentials: false` already in cors.php |
| Default auth guard = sanctum | Tasks 2 .env (AUTH_GUARD=sanctum) |
| roles: admin, store_keeper, seller | Task 3 RoleSeeder |
| spatie/laravel-permission guard_name = sanctum | Task 3 RoleSeeder |
| users.role enum | Task 2 migration |
| users.location_id plain unsigned bigint nullable | Task 2 migration (no FK — Phase 3) |
| users.is_active boolean | Task 2 migration |
| Login returns token + user | Task 5 LoginController |
| Inactive user rejected on login | Task 5 LoginController + test |
| Logout revokes current token | Task 5 LogoutController |
| Me returns id/name/email/role/location_id/is_active | Task 5 MeController |
| 401 for unauthenticated protected endpoints | Task 5 tests |
| Pint passes on all modified files | Each task: Step N-1 before commit |
| PHPStan level 5 passes | Task 5 Step 9 |
| Full Pest suite stays green throughout | Each task: full suite run before commit |

**Placeholder scan:** No TBDs, all code blocks are complete.

**Type consistency:**
- `User->role` is a string (PHP), cast is not set (enum values enforced at DB level). `$user->role ?? 'guest'` in Task 4 is correct.
- `User->location_id` cast to `'integer'` in Task 2; `json_encode([$user->location_id])` in Task 4 produces `[3]` correctly.
- `$user->only([...])` in Task 5 controllers returns exactly the keys asserted in tests.
- `Sanctum::actingAs($user)` in tests — consistent across Tasks 4 and 5 test files.
