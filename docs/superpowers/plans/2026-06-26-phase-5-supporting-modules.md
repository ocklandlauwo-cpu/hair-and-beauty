# Phase 5: Supporting Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four supporting API module groups — News/Announcements, Expenses, Geofenced Attendance, and P&L Reporting — completing the full backend feature set before dashboard/email work in Phase 6.

**Architecture:** All Phase 3 tables (`news`, `expenses`, `attendance`) already exist with RLS policies in place. Phase 5 adds only Eloquent models, policies, form requests, controllers, and routes — zero new migrations. The Attendance module computes geofence containment in PHP using the Haversine formula; all other modules are standard CRUD with role-scoped visibility. The P&L report aggregates `sale_items` × (unit_price − unit_cost) minus `expenses` for a configurable date range and optional location filter.

**Tech Stack:** PHP 8.4 / Laravel 12 / Eloquent / Pest 4 (no new packages)

## Global Constraints

- PHP binary: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe` (PATH has PHP 7.4)
- All `php artisan` from `backend/` directory
- All Pest: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage`
- All Pint: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint <file>`
- PHPStan: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M`
- Authorization: `$user->role` directly — NOT `$user->hasRole()`; roles: `admin`, `store_keeper`, `seller`
- GUC pattern for non-admin tests: set before request, RESET in finally; re-set admin GUC before any subsequent admin DB reads under FORCE RLS
- `TestCase::setUp()` sets `app.role=admin` GUC; all tests run as admin by default unless overridden
- Expense categories exactly: `salary`, `security`, `electricity`, `cleanliness`, `rent`, `transport`
- Money columns: TZS, cast `'decimal:2'`; use `bcadd`/`bcsub`/`bcmul` for PHP arithmetic
- Response format: `['data' => ...]` single items; paginated lists use `{data, meta}`
- `Attendance` model: `public $timestamps = false` (immutable — `created_at` set by DB; no `updated_at`)
- All controllers in `App\Http\Controllers\Api\V1\` namespace
- All policies in `App\Policies\`, registered in `AppServiceProvider::boot()` via `Gate::policy()`
- All Form Requests in `App\Http\Requests\Api\V1\` namespace
- Pint on every file you modify before committing
- No new migrations — all tables exist from Phase 3

---

## Task 1: News / Announcements API

**Files:**
- Create: `backend/app/Models/News.php`
- Create: `backend/app/Policies/NewsPolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreNewsRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/UpdateNewsRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/NewsController.php`
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/NewsTest.php`

**Interfaces:**
- Produces: `GET /api/v1/news` (published for non-admins; all for admin), `POST /api/v1/news` (admin), `PUT /api/v1/news/{news}` (admin), `DELETE /api/v1/news/{news}` (admin)

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/NewsTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  it('admin can create a news article', function () {
      Sanctum::actingAs(User::factory()->admin()->create());

      $this->postJson('/api/v1/news', [
          'title' => 'Store Holiday Hours',
          'body'  => 'We will be closed on Saturday.',
          'is_published' => true,
      ])
          ->assertCreated()
          ->assertJsonPath('data.title', 'Store Holiday Hours')
          ->assertJsonPath('data.is_published', true);
  });

  it('seller can list only published news', function () {
      $admin = User::factory()->admin()->create();
      DB::table('news')->insert([
          ['title' => 'Published Post',   'body' => 'x', 'created_by' => $admin->id, 'is_published' => true,  'published_at' => now(), 'created_at' => now(), 'updated_at' => now()],
          ['title' => 'Unpublished Post', 'body' => 'y', 'created_by' => $admin->id, 'is_published' => false, 'published_at' => null,  'created_at' => now(), 'updated_at' => now()],
      ]);
      Sanctum::actingAs(User::factory()->seller()->create());

      $response = $this->getJson('/api/v1/news')->assertOk();
      $titles = collect($response->json('data'))->pluck('title');
      expect($titles)->toContain('Published Post')
          ->not->toContain('Unpublished Post');
  });

  it('admin can list all news including unpublished', function () {
      $admin = User::factory()->admin()->create();
      DB::table('news')->insert([
          ['title' => 'AdminVisible', 'body' => 'z', 'created_by' => $admin->id, 'is_published' => false, 'published_at' => null, 'created_at' => now(), 'updated_at' => now()],
      ]);
      Sanctum::actingAs($admin);

      $titles = collect($this->getJson('/api/v1/news')->assertOk()->json('data'))->pluck('title');
      expect($titles)->toContain('AdminVisible');
  });

  it('admin can update a news article', function () {
      $admin = User::factory()->admin()->create();
      $newsId = DB::table('news')->insertGetId(['title' => 'Old', 'body' => 'x', 'created_by' => $admin->id, 'is_published' => false, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs($admin);

      $this->putJson("/api/v1/news/{$newsId}", ['title' => 'Updated', 'body' => 'x'])
          ->assertOk()
          ->assertJsonPath('data.title', 'Updated');
  });

  it('seller cannot create news', function () {
      Sanctum::actingAs(User::factory()->seller()->create());
      $this->postJson('/api/v1/news', ['title' => 'X', 'body' => 'Y', 'is_published' => true])
          ->assertForbidden();
  });

  it('admin can delete a news article', function () {
      $admin = User::factory()->admin()->create();
      $newsId = DB::table('news')->insertGetId(['title' => 'ToDelete', 'body' => 'x', 'created_by' => $admin->id, 'is_published' => true, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs($admin);

      $this->deleteJson("/api/v1/news/{$newsId}")->assertOk();
      expect(DB::table('news')->find($newsId))->toBeNull();
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL (routes don't exist)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/NewsTest.php
  ```

- [ ] **Step 3: Create `backend/app/Models/News.php`**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class News extends Model
  {
      protected $table = 'news';

      protected $fillable = ['title', 'body', 'created_by', 'is_published', 'published_at'];

      protected function casts(): array
      {
          return [
              'is_published' => 'boolean',
              'published_at' => 'datetime',
          ];
      }

      public function author(): BelongsTo
      {
          return $this->belongsTo(User::class, 'created_by');
      }
  }
  ```

- [ ] **Step 4: Create `backend/app/Policies/NewsPolicy.php`**

  ```php
  <?php

  namespace App\Policies;

  use App\Models\User;

  class NewsPolicy
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

- [ ] **Step 5: Create Form Requests**

  **`backend/app/Http/Requests/Api/V1/StoreNewsRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class StoreNewsRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return $this->user()->role === 'admin';
      }

      public function rules(): array
      {
          return [
              'title'        => ['required', 'string', 'max:255'],
              'body'         => ['required', 'string'],
              'is_published' => ['nullable', 'boolean'],
          ];
      }
  }
  ```

  **`backend/app/Http/Requests/Api/V1/UpdateNewsRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class UpdateNewsRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return $this->user()->role === 'admin';
      }

      public function rules(): array
      {
          return [
              'title'        => ['sometimes', 'string', 'max:255'],
              'body'         => ['sometimes', 'string'],
              'is_published' => ['sometimes', 'boolean'],
          ];
      }
  }
  ```

- [ ] **Step 6: Create `backend/app/Http/Controllers/Api/V1/NewsController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StoreNewsRequest;
  use App\Http\Requests\Api\V1\UpdateNewsRequest;
  use App\Models\News;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Http\Request;

  class NewsController extends Controller
  {
      private const FIELDS = ['id', 'title', 'body', 'created_by', 'is_published', 'published_at', 'created_at'];

      public function index(Request $request): JsonResponse
      {
          $isAdmin = $request->user()->role === 'admin';

          $news = News::when(! $isAdmin, fn ($q) => $q->where('is_published', true))
              ->latest()
              ->paginate(20);

          return response()->json($news->through(fn ($n) => $n->only(self::FIELDS)));
      }

      public function store(StoreNewsRequest $request): JsonResponse
      {
          $validated = $request->validated();

          $news = News::create([
              'title'        => $validated['title'],
              'body'         => $validated['body'],
              'is_published' => $validated['is_published'] ?? false,
              'published_at' => ($validated['is_published'] ?? false) ? now() : null,
              'created_by'   => $request->user()->id,
          ]);

          return response()->json(['data' => $news->only(self::FIELDS)], 201);
      }

      public function show(Request $request, News $news): JsonResponse
      {
          if (! $news->is_published && $request->user()->role !== 'admin') {
              abort(403, 'News article is not published.');
          }

          return response()->json(['data' => $news->only(self::FIELDS)]);
      }

      public function update(UpdateNewsRequest $request, News $news): JsonResponse
      {
          $validated = $request->validated();

          if (isset($validated['is_published']) && $validated['is_published'] && ! $news->published_at) {
              $validated['published_at'] = now();
          }

          $news->update($validated);

          return response()->json(['data' => $news->fresh()->only(self::FIELDS)]);
      }

      public function destroy(News $news): JsonResponse
      {
          $this->authorize('delete', $news);
          $news->delete();

          return response()->json(['message' => 'News article deleted']);
      }
  }
  ```

- [ ] **Step 7: Register policy + add routes**

  In `AppServiceProvider::boot()`, add:
  ```php
  use App\Models\News;
  use App\Policies\NewsPolicy;
  Gate::policy(News::class, NewsPolicy::class);
  ```

  In `routes/api.php`, inside the `auth:sanctum` group, add:
  ```php
  use App\Http\Controllers\Api\V1\NewsController;
  Route::apiResource('/news', NewsController::class);
  ```

- [ ] **Step 8: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/NewsTest.php
  ```

  Expected: 6 tests passing.

- [ ] **Step 9: Full suite + PHPStan + Pint + Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  cd ..
  git add backend/app/Models/News.php backend/app/Policies/NewsPolicy.php \
          backend/app/Http/Requests/Api/V1/StoreNewsRequest.php \
          backend/app/Http/Requests/Api/V1/UpdateNewsRequest.php \
          backend/app/Http/Controllers/Api/V1/NewsController.php \
          backend/app/Providers/AppServiceProvider.php \
          backend/routes/api.php backend/tests/Feature/Api/NewsTest.php
  git commit -m "feat(api): news/announcements — admin CRUD, published/unpublished visibility"
  ```

---

## Task 2: Expenses API

**Files:**
- Create: `backend/app/Models/Expense.php`
- Create: `backend/app/Policies/ExpensePolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreExpenseRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/ExpenseController.php`
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/ExpensesTest.php`

**Interfaces:**
- Produces: `GET /api/v1/expenses` (admin+store_keeper see all; seller sees own location), `POST /api/v1/expenses` (admin+store_keeper+seller), `GET /api/v1/expenses/{expense}` — consumed by Task 4 P&L

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/ExpensesTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  it('seller can record an expense for their shop', function () {
      $shopId = DB::table('locations')->insertGetId(['name' => 'ExpShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $seller = User::factory()->seller()->create(['location_id' => $shopId]);
      Sanctum::actingAs($seller);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$shopId]), false)");

      try {
          $this->postJson('/api/v1/expenses', [
              'category'     => 'rent',
              'amount'       => 500000,
              'expense_date' => today()->toDateString(),
          ])
              ->assertCreated()
              ->assertJsonPath('data.category', 'rent')
              ->assertJsonPath('data.amount', '500000.00')
              ->assertJsonPath('data.location_id', $shopId);
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('admin can record an expense for any location', function () {
      $shopId = DB::table('locations')->insertGetId(['name' => 'AdminExpShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->admin()->create());

      $this->postJson('/api/v1/expenses', [
          'category'     => 'electricity',
          'amount'       => 75000,
          'expense_date' => today()->toDateString(),
          'location_id'  => $shopId,
      ])
          ->assertCreated()
          ->assertJsonPath('data.location_id', $shopId);
  });

  it('expense category must be valid', function () {
      $shopId = DB::table('locations')->insertGetId(['name' => 'ValShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->seller()->create(['location_id' => $shopId]));

      $this->postJson('/api/v1/expenses', [
          'category'     => 'invalid_category',
          'amount'       => 100,
          'expense_date' => today()->toDateString(),
      ])->assertUnprocessable();
  });

  it('admin can list all expenses', function () {
      $shopId = DB::table('locations')->insertGetId(['name' => 'ListShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $seller  = User::factory()->seller()->create(['location_id' => $shopId]);
      DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'salary', 'amount' => 300000, 'expense_date' => today(), 'recorded_by' => $seller->id, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->admin()->create());

      $this->getJson('/api/v1/expenses')->assertOk()->assertJsonStructure(['data', 'meta']);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/ExpensesTest.php
  ```

- [ ] **Step 3: Create `backend/app/Models/Expense.php`**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class Expense extends Model
  {
      protected $fillable = [
          'location_id', 'category', 'amount',
          'expense_date', 'recorded_by', 'notes',
      ];

      protected function casts(): array
      {
          return [
              'amount'       => 'decimal:2',
              'expense_date' => 'date',
          ];
      }

      public function location(): BelongsTo
      {
          return $this->belongsTo(Location::class);
      }
  }
  ```

- [ ] **Step 4: Create `backend/app/Policies/ExpensePolicy.php`**

  ```php
  <?php

  namespace App\Policies;

  use App\Models\User;

  class ExpensePolicy
  {
      public function viewAny(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper', 'seller']);
      }

      public function create(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper', 'seller']);
      }
  }
  ```

- [ ] **Step 5: Create `backend/app/Http/Requests/Api/V1/StoreExpenseRequest.php`**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class StoreExpenseRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return in_array($this->user()->role, ['admin', 'store_keeper', 'seller']);
      }

      public function rules(): array
      {
          return [
              'category'     => ['required', 'in:salary,security,electricity,cleanliness,rent,transport'],
              'amount'       => ['required', 'numeric', 'min:0'],
              'expense_date' => ['required', 'date'],
              'notes'        => ['nullable', 'string'],
              'location_id'  => ['nullable', 'integer', 'exists:locations,id'],
          ];
      }
  }
  ```

- [ ] **Step 6: Create `backend/app/Http/Controllers/Api/V1/ExpenseController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StoreExpenseRequest;
  use App\Models\Expense;
  use Illuminate\Http\JsonResponse;

  class ExpenseController extends Controller
  {
      private const FIELDS = ['id', 'location_id', 'category', 'amount', 'expense_date', 'recorded_by', 'notes'];

      public function index(): JsonResponse
      {
          $this->authorize('viewAny', Expense::class);
          $expenses = Expense::latest('expense_date')->paginate(50);

          return response()->json($expenses->through(fn ($e) => $e->only(self::FIELDS)));
      }

      public function store(StoreExpenseRequest $request): JsonResponse
      {
          $user      = $request->user();
          $validated = $request->validated();

          // Admin may specify any location; all others default to their own
          $locationId = ($user->role === 'admin' && isset($validated['location_id']))
              ? $validated['location_id']
              : $user->location_id;

          $expense = Expense::create([
              'location_id'  => $locationId,
              'category'     => $validated['category'],
              'amount'       => $validated['amount'],
              'expense_date' => $validated['expense_date'],
              'recorded_by'  => $user->id,
              'notes'        => $validated['notes'] ?? null,
          ]);

          return response()->json(['data' => $expense->only(self::FIELDS)], 201);
      }

      public function show(Expense $expense): JsonResponse
      {
          $this->authorize('viewAny', Expense::class);

          return response()->json(['data' => $expense->only(self::FIELDS)]);
      }
  }
  ```

- [ ] **Step 7: Register policy + add routes**

  In `AppServiceProvider::boot()`, add:
  ```php
  use App\Models\Expense;
  use App\Policies\ExpensePolicy;
  Gate::policy(Expense::class, ExpensePolicy::class);
  ```

  In `routes/api.php`, inside `auth:sanctum`:
  ```php
  use App\Http\Controllers\Api\V1\ExpenseController;
  Route::apiResource('/expenses', ExpenseController::class)->only(['index', 'show', 'store']);
  ```

- [ ] **Step 8: Run tests — PASS, full suite, PHPStan, Pint, Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/ExpensesTest.php
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  cd ..
  git add backend/app/Models/Expense.php backend/app/Policies/ExpensePolicy.php \
          backend/app/Http/Requests/Api/V1/StoreExpenseRequest.php \
          backend/app/Http/Controllers/Api/V1/ExpenseController.php \
          backend/app/Providers/AppServiceProvider.php \
          backend/routes/api.php backend/tests/Feature/Api/ExpensesTest.php
  git commit -m "feat(api): expenses — per-shop recording with category validation (TZS)"
  ```

---

## Task 3: Geofenced Attendance API

**Files:**
- Create: `backend/app/Models/Attendance.php`
- Create: `backend/app/Http/Requests/Api/V1/ClockAttendanceRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/AttendanceController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/AttendanceTest.php`

**Interfaces:**
- Produces: `POST /api/v1/attendance` (seller clock-in/out with lat/lng; returns `is_within_geofence` + `distance_m`), `GET /api/v1/attendance` (admin+store_keeper see all; seller sees own)

**Haversine formula** (Earth radius = 6 371 000 m):
```
a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlng/2)
d = 6371000 × 2 × atan2(√a, √(1-a))
```
A Δlat of 0.0009° ≈ 100 m (the default geofence radius). Use this for test data.

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/AttendanceTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  function attendanceShop(): array
  {
      $shopLat = -6.7924;
      $shopLng = 39.2083;
      $shopId  = DB::table('locations')->insertGetId([
          'name'               => 'AttShop'.uniqid(),
          'type'               => 'shop',
          'geofence_lat'       => $shopLat,
          'geofence_lng'       => $shopLng,
          'geofence_radius_m'  => 100,
          'is_active'          => true,
          'created_at'         => now(),
          'updated_at'         => now(),
      ]);
      $seller = User::factory()->seller()->create(['location_id' => $shopId]);
      return compact('shopId', 'shopLat', 'shopLng', 'seller');
  }

  it('seller can clock in and is_within_geofence is true when within 100m', function () {
      $f = attendanceShop();
      Sanctum::actingAs($f['seller']);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$f[shopId]]), false)");

      try {
          $this->postJson('/api/v1/attendance', [
              'action'    => 'clock_in',
              'latitude'  => $f['shopLat'] + 0.0005, // ~55m — within 100m geofence
              'longitude' => $f['shopLng'],
          ])
              ->assertCreated()
              ->assertJsonPath('data.action', 'clock_in')
              ->assertJsonPath('data.is_within_geofence', true);
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('clock_in is marked outside geofence when beyond radius', function () {
      $f = attendanceShop();
      Sanctum::actingAs($f['seller']);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$f[shopId]]), false)");

      try {
          $this->postJson('/api/v1/attendance', [
              'action'    => 'clock_out',
              'latitude'  => $f['shopLat'] + 0.01, // ~1.1km — outside
              'longitude' => $f['shopLng'],
          ])
              ->assertCreated()
              ->assertJsonPath('data.is_within_geofence', false);
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('attendance requires a valid action', function () {
      $f = attendanceShop();
      Sanctum::actingAs($f['seller']);

      $this->postJson('/api/v1/attendance', [
          'action'    => 'invalid_action',
          'latitude'  => $f['shopLat'],
          'longitude' => $f['shopLng'],
      ])->assertUnprocessable();
  });

  it('admin can list all attendance records', function () {
      Sanctum::actingAs(User::factory()->admin()->create());
      $this->getJson('/api/v1/attendance')->assertOk()->assertJsonStructure(['data', 'meta']);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/AttendanceTest.php
  ```

- [ ] **Step 3: Create `backend/app/Models/Attendance.php`**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class Attendance extends Model
  {
      public $timestamps = false; // immutable — only created_at set by DB default

      protected $fillable = [
          'user_id', 'location_id', 'action',
          'latitude', 'longitude', 'is_within_geofence', 'recorded_at',
      ];

      protected function casts(): array
      {
          return [
              'latitude'           => 'decimal:8',
              'longitude'          => 'decimal:8',
              'is_within_geofence' => 'boolean',
              'recorded_at'        => 'datetime',
          ];
      }

      public function user(): BelongsTo
      {
          return $this->belongsTo(User::class);
      }

      public function location(): BelongsTo
      {
          return $this->belongsTo(Location::class);
      }
  }
  ```

- [ ] **Step 4: Create `backend/app/Http/Requests/Api/V1/ClockAttendanceRequest.php`**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class ClockAttendanceRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return in_array($this->user()->role, ['admin', 'store_keeper', 'seller']);
      }

      public function rules(): array
      {
          return [
              'action'      => ['required', 'in:clock_in,clock_out'],
              'latitude'    => ['required', 'numeric', 'between:-90,90'],
              'longitude'   => ['required', 'numeric', 'between:-180,180'],
              'recorded_at' => ['nullable', 'date'],
          ];
      }
  }
  ```

- [ ] **Step 5: Create `backend/app/Http/Controllers/Api/V1/AttendanceController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\ClockAttendanceRequest;
  use App\Models\Attendance;
  use App\Models\Location;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Http\Request;

  class AttendanceController extends Controller
  {
      public function index(Request $request): JsonResponse
      {
          $user    = $request->user();
          $records = Attendance::when(
              $user->role === 'seller',
              fn ($q) => $q->where('user_id', $user->id)
          )
              ->latest('recorded_at')
              ->paginate(50);

          return response()->json($records->through(fn ($a) => $a->only([
              'id', 'user_id', 'location_id', 'action',
              'latitude', 'longitude', 'is_within_geofence', 'recorded_at',
          ])));
      }

      public function store(ClockAttendanceRequest $request): JsonResponse
      {
          $user      = $request->user();
          $validated = $request->validated();
          $location  = Location::find($user->location_id);

          $isWithinGeofence = false;
          $distanceM        = null;

          if ($location && $location->geofence_lat !== null && $location->geofence_lng !== null) {
              $distanceM        = $this->haversineDistance(
                  (float) $validated['latitude'],
                  (float) $validated['longitude'],
                  (float) $location->geofence_lat,
                  (float) $location->geofence_lng,
              );
              $isWithinGeofence = $distanceM <= $location->geofence_radius_m;
          }

          $attendance = Attendance::create([
              'user_id'            => $user->id,
              'location_id'        => $user->location_id,
              'action'             => $validated['action'],
              'latitude'           => $validated['latitude'],
              'longitude'          => $validated['longitude'],
              'is_within_geofence' => $isWithinGeofence,
              'recorded_at'        => $validated['recorded_at'] ?? now(),
          ]);

          return response()->json([
              'data' => [
                  'id'                 => $attendance->id,
                  'action'             => $attendance->action,
                  'is_within_geofence' => $attendance->is_within_geofence,
                  'distance_m'         => $distanceM !== null ? round($distanceM, 1) : null,
                  'recorded_at'        => $attendance->recorded_at,
              ],
          ], 201);
      }

      private function haversineDistance(float $lat1, float $lng1, float $lat2, float $lng2): float
      {
          $R  = 6371000.0;
          $φ1 = deg2rad($lat1);
          $φ2 = deg2rad($lat2);
          $Δφ = deg2rad($lat2 - $lat1);
          $Δλ = deg2rad($lng2 - $lng1);
          $a  = sin($Δφ / 2) ** 2 + cos($φ1) * cos($φ2) * sin($Δλ / 2) ** 2;

          return $R * 2.0 * atan2(sqrt($a), sqrt(1.0 - $a));
      }
  }
  ```

- [ ] **Step 6: Add routes**

  In `routes/api.php`, inside `auth:sanctum`:
  ```php
  use App\Http\Controllers\Api\V1\AttendanceController;
  Route::get('/attendance', [AttendanceController::class, 'index'])->name('attendance.index');
  Route::post('/attendance', [AttendanceController::class, 'store'])->name('attendance.store');
  ```

- [ ] **Step 7: Run tests — PASS, full suite, PHPStan, Pint, Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/AttendanceTest.php
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  cd ..
  git add backend/app/Models/Attendance.php \
          backend/app/Http/Requests/Api/V1/ClockAttendanceRequest.php \
          backend/app/Http/Controllers/Api/V1/AttendanceController.php \
          backend/routes/api.php backend/tests/Feature/Api/AttendanceTest.php
  git commit -m "feat(api): geofenced attendance — clock-in/out with Haversine distance check"
  ```

---

## Task 4: P&L Report API

**Files:**
- Create: `backend/app/Http/Controllers/Api/V1/PnlController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/PnlTest.php`

**Interfaces:**
- Consumes: `sale_items` × `sales` (revenue + COGS), `expenses` (operating costs) from Tasks 1–3 and Phase 4
- Produces: `GET /api/v1/reports/pnl?from=&to=&location_id=` → `{data: {location_id, period, revenue, cost_of_goods_sold, gross_profit, expenses, net_profit, expense_breakdown}}`

**P&L formula:**
- Revenue = Σ(unit_price × quantity) from non-reverted sales in period
- COGS = Σ(unit_cost × quantity) from non-reverted sales in period
- Gross Profit = Revenue − COGS
- Expenses = Σ(amount) from expenses table in period
- Net Profit = Gross Profit − Expenses

**Seller sees only their location; admin and store_keeper may pass any `location_id`.**

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/PnlTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  function pnlFixtures(): array
  {
      $shopId  = DB::table('locations')->insertGetId(['name' => 'PnlShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $catId   = DB::table('categories')->insertGetId(['name' => 'PnlCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      $prodId  = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'PnlProd'.uniqid(), 'wholesale_price' => 10000, 'retail_price' => 15000, 'latest_cost' => 8000, 'created_at' => now(), 'updated_at' => now()]);
      $seller  = User::factory()->seller()->create(['location_id' => $shopId]);
      $admin   = User::factory()->admin()->create();

      // Insert a sale
      $saleId = DB::table('sales')->insertGetId(['location_id' => $shopId, 'sold_by' => $seller->id, 'payment_method' => 'nmb', 'total_amount' => 15000, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
      DB::table('sale_items')->insert(['sale_id' => $saleId, 'product_id' => $prodId, 'quantity' => 1, 'unit_price' => 15000, 'unit_cost' => 8000, 'price_tier' => 'retail', 'created_at' => now()]);

      // Insert an expense
      DB::table('expenses')->insert(['location_id' => $shopId, 'category' => 'rent', 'amount' => 500000, 'expense_date' => today(), 'recorded_by' => $seller->id, 'created_at' => now(), 'updated_at' => now()]);

      return compact('shopId', 'seller', 'admin');
  }

  it('admin can retrieve P&L for a specific location', function () {
      $f = pnlFixtures();
      Sanctum::actingAs($f['admin']);

      $response = $this->getJson("/api/v1/reports/pnl?location_id={$f['shopId']}&from=".today()->toDateString().'&to='.today()->toDateString());

      $response->assertOk()
          ->assertJsonPath('data.revenue', '15000.00')
          ->assertJsonPath('data.cost_of_goods_sold', '8000.00')
          ->assertJsonPath('data.gross_profit', '7000.00')
          ->assertJsonPath('data.expenses', '500000.00')
          ->assertJsonPath('data.net_profit', '-493000.00');
  });

  it('seller P&L is scoped to their location automatically', function () {
      $f = pnlFixtures();
      Sanctum::actingAs($f['seller']);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$f[shopId]]), false)");

      try {
          $response = $this->getJson('/api/v1/reports/pnl?from='.today()->toDateString().'&to='.today()->toDateString());

          $response->assertOk()
              ->assertJsonPath('data.location_id', $f['shopId'])
              ->assertJsonPath('data.revenue', '15000.00');
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('reverted sales are excluded from P&L', function () {
      $f    = pnlFixtures();
      $admin = $f['admin'];

      // Create a reverted sale
      $saleId = DB::table('sales')->insertGetId(['location_id' => $f['shopId'], 'sold_by' => $f['seller']->id, 'payment_method' => 'nmb', 'total_amount' => 30000, 'discount_amount' => 0, 'is_reverted' => true, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
      DB::table('sale_items')->insert(['sale_id' => $saleId, 'product_id' => DB::table('products')->first()->id, 'quantity' => 2, 'unit_price' => 15000, 'unit_cost' => 8000, 'price_tier' => 'retail', 'created_at' => now()]);

      Sanctum::actingAs($admin);
      $response = $this->getJson("/api/v1/reports/pnl?location_id={$f['shopId']}&from=".today()->toDateString().'&to='.today()->toDateString());

      // Revenue should still be 15000 (only the non-reverted sale from fixtures)
      $response->assertOk()->assertJsonPath('data.revenue', '15000.00');
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/PnlTest.php
  ```

- [ ] **Step 3: Create `backend/app/Http/Controllers/Api/V1/PnlController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Http\Request;
  use Illuminate\Support\Facades\DB;

  class PnlController extends Controller
  {
      public function index(Request $request): JsonResponse
      {
          $request->validate([
              'from'        => ['nullable', 'date'],
              'to'          => ['nullable', 'date'],
              'location_id' => ['nullable', 'integer', 'exists:locations,id'],
          ]);

          $user       = $request->user();
          $from       = $request->input('from', now()->startOfMonth()->toDateString());
          $to         = $request->input('to', now()->toDateString());
          $locationId = (int) $request->input('location_id');

          // Sellers are always scoped to their own location
          if ($user->role === 'seller') {
              $locationId = $user->location_id;
          }

          // Revenue & COGS from non-reverted sale_items
          $salesQuery = DB::table('sale_items as si')
              ->join('sales as s', 's.id', '=', 'si.sale_id')
              ->whereBetween('s.sale_date', [$from, $to])
              ->where('s.is_reverted', false);

          if ($locationId) {
              $salesQuery->where('s.location_id', $locationId);
          }

          $revenue = (string) number_format(
              (float) $salesQuery->sum(DB::raw('si.unit_price * si.quantity')), 2, '.', ''
          );
          $cogs = (string) number_format(
              (float) $salesQuery->sum(DB::raw('si.unit_cost * si.quantity')), 2, '.', ''
          );

          // Operating expenses
          $expenseQuery = DB::table('expenses')
              ->whereBetween('expense_date', [$from, $to]);

          if ($locationId) {
              $expenseQuery->where('location_id', $locationId);
          }

          $totalExpenses = (string) number_format(
              (float) $expenseQuery->sum('amount'), 2, '.', ''
          );

          $expenseBreakdown = DB::table('expenses')
              ->whereBetween('expense_date', [$from, $to])
              ->when($locationId, fn ($q) => $q->where('location_id', $locationId))
              ->select('category', DB::raw('SUM(amount) as total'))
              ->groupBy('category')
              ->orderBy('category')
              ->get()
              ->map(fn ($row) => [
                  'category' => $row->category,
                  'total'    => number_format((float) $row->total, 2, '.', ''),
              ]);

          $grossProfit = bcsub($revenue, $cogs, 2);
          $netProfit   = bcsub($grossProfit, $totalExpenses, 2);

          return response()->json([
              'data' => [
                  'location_id'       => $locationId ?: null,
                  'period'            => ['from' => $from, 'to' => $to],
                  'revenue'           => $revenue,
                  'cost_of_goods_sold' => $cogs,
                  'gross_profit'      => $grossProfit,
                  'expenses'          => $totalExpenses,
                  'net_profit'        => $netProfit,
                  'expense_breakdown' => $expenseBreakdown,
              ],
          ]);
      }
  }
  ```

- [ ] **Step 4: Add route + update progress ledger**

  In `routes/api.php`, inside `auth:sanctum`:
  ```php
  use App\Http\Controllers\Api\V1\PnlController;
  Route::get('/reports/pnl', [PnlController::class, 'index'])->name('reports.pnl');
  ```

  Update `.superpowers/sdd/progress.md`: mark Phase 5 complete, outline Phase 6.

- [ ] **Step 5: Run tests — PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/PnlTest.php
  ```

  Expected: 3 tests passing.

- [ ] **Step 6: Full suite + PHPStan + Pint**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  ```

- [ ] **Step 7: Commit + merge to master + cut Phase 6 branch**

  ```bash
  cd ..
  git add backend/app/Http/Controllers/Api/V1/PnlController.php \
          backend/routes/api.php \
          backend/tests/Feature/Api/PnlTest.php \
          .superpowers/sdd/progress.md
  git commit -m "feat(api): P&L report — revenue vs COGS vs expenses, role-scoped, date range"
  git checkout master
  git merge --no-ff feature/phase-5-supporting-modules \
      -m "feat: complete Phase 5 — news, expenses, geofenced attendance, P&L report"
  git checkout -b feature/phase-6-reporting-dashboards
  ```

---

## Self-Review

**Spec coverage:**

| Module | Spec requirement | Task |
|---|---|---|
| News/Announcements — admin CRUD | Task 1 (6 endpoints: GET list, GET one, POST, PUT, DELETE) |
| News — shown on dashboards (published only for non-admin) | Task 1 NewsController::index() filter |
| Expenses — per-shop categories | Task 2 (salary/security/electricity/cleanliness/rent/transport) |
| Expenses — amount in TZS | Task 2 (decimal:2 cast, numeric validation) |
| Geofenced attendance — 100m radius | Task 3 Haversine check vs location.geofence_radius_m |
| Attendance — clock_in / clock_out | Task 3 (action enum, both values tested) |
| Attendance — for monitoring only | Task 3 (no enforcement of other permissions) |
| P&L — Profit = Σ((selling_price − latest_cost) × qty) − expenses | Task 4 (unit_price − unit_cost per item, minus expenses) |
| P&L — adjustable date range | Task 4 `from`/`to` query params |
| P&L — role-scoped (seller sees own location) | Task 4 seller auto-scoping |

**Spec gaps:** Restock alerts (shift-between-shops, 3-month restock rate) are in the spec's alert list but are deferred to Phase 6 dashboards (they require complex analytics). The expiry and low-stock views already exposed in Phase 4 `/stock/alerts/*` cover the 60d and 30d alert requirements.

**Placeholder scan:** All controller implementations are complete with actual SQL and arithmetic. No TBD patterns.

**Type consistency:**
- `Expense::$fillable` includes `location_id` — consistent with how `SaleController` handles location (takes from user). `ExpenseController::store()` uses `$locationId = ($user->role === 'admin' && isset($validated['location_id'])) ? ... : $user->location_id` — safe because `StoreExpenseRequest::rules()` has `location_id` as nullable.
- `Attendance::$timestamps = false` — matches Phase 3 migration constraint (immutable, only `created_at`).
- `PnlController` uses `number_format(..., 2, '.', '')` then `bcsub` — both return strings with 2 decimal places. The `bcmath` functions treat the `number_format` output as valid numeric strings. Type-safe.
- `haversineDistance()` private method returns `float` — used directly in `<= $location->geofence_radius_m` comparison. `geofence_radius_m` is cast as `integer` in `Location` model. PHP compares `float` to `int` correctly.
