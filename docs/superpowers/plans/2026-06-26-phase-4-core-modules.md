# Phase 4: Core Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the five core API module groups — Catalogue, Purchasing/Inventory, Distribution, POS/Sales, and Reconciliation/Users — wiring Eloquent models, Form Requests, Laravel Policies, and controllers to the Phase 3 schema.

**Architecture:** Each module follows a 3-layer authorization stack: `auth:sanctum` middleware (outer) → Laravel Policy checking `$user->role` directly → PostgreSQL RLS enforcing row visibility (inner). Controllers are thin: validate in FormRequest, authorize in Policy, persist with DB::transaction where multi-table writes are needed. No API Resources — responses use `->only([...])` or `->map()` for consistency with the Phase 2 auth controllers.

**Tech Stack:** PHP 8.4 / Laravel 12 / Sanctum 4.3 / Eloquent / Pest 4

## Global Constraints

- PHP binary: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe` (PATH has PHP 7.4)
- All `php artisan` from `backend/` directory
- All Pest: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage`
- All Pint: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint <file>`
- PHPStan: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M`
- Authorization: check `$user->role` directly (NOT `$user->hasRole()` — spatie roles duality unresolved)
- Three roles exactly: `admin`, `store_keeper`, `seller`
- All money columns are `decimal(12,2)` in TZS — cast as `'decimal:2'` in Eloquent
- Immutable models (`StockMovement`, `SaleItem`) must have `public $timestamps = false`
- `TestCase::setUp()` already sets `app.role=admin` GUC — all tests run as admin by default
- To test non-admin behavior, call `DB::statement("SELECT set_config('app.role', ?, false)", [$role])` then reset in `finally`
- Payment methods exactly: `nmb`, `airtel`, `vodacom`, `tigo`
- Expense categories exactly: `salary`, `security`, `electricity`, `cleanliness`, `rent`, `transport`
- Wholesale threshold default: 12 units (per product, configurable in `products.wholesale_threshold`)
- Price tier: `quantity >= product.wholesale_threshold` → `wholesale`; else → `retail`
- Route prefix: `api/v1` — all routes under `auth:sanctum` middleware except ping/login
- All controllers in `App\Http\Controllers\Api\V1\` namespace
- All policies in `App\Policies\` namespace, registered in `AppServiceProvider`
- All Form Requests in `App\Http\Requests\Api\V1\` namespace
- All models in `App\Models\` namespace
- Pint on every file you modify before committing

---

## Task 1: Catalogue API — Categories, Products, Batches

**Files:**
- Create: `backend/app/Models/Category.php`
- Create: `backend/app/Models/Product.php`
- Create: `backend/app/Models/Batch.php`
- Create: `backend/app/Policies/ProductPolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreProductRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/UpdateProductRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreBatchRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/CategoryController.php`
- Create: `backend/app/Http/Controllers/Api/V1/ProductController.php`
- Create: `backend/app/Http/Controllers/Api/V1/BatchController.php`
- Modify: `backend/app/Providers/AppServiceProvider.php` (register policies)
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/CatalogueTest.php`

**Interfaces:**
- Produces: `Product::$fillable`, `Product::casts()`, `GET /api/v1/products` (paginated), `POST /api/v1/products` (admin), `PUT /api/v1/products/{product}` (admin), `GET /api/v1/categories`, `GET /api/v1/products/{product}/batches`, `POST /api/v1/products/{product}/batches` — consumed by Tasks 2–4

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/CatalogueTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  // ── Categories ────────────────────────────────────────────────────────────
  it('any authenticated role can list categories', function () {
      DB::table('categories')->insertOrIgnore([
          ['name' => 'Hair',      'created_at' => now(), 'updated_at' => now()],
          ['name' => 'Cosmetics', 'created_at' => now(), 'updated_at' => now()],
      ]);
      Sanctum::actingAs(User::factory()->seller()->create());

      $this->getJson('/api/v1/categories')
          ->assertOk()
          ->assertJsonStructure(['data' => [['id', 'name']]]);
  });

  // ── Products ──────────────────────────────────────────────────────────────
  it('admin can create a product', function () {
      $catId = DB::table('categories')->insertGetId(['name' => 'TestCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->admin()->create());

      $this->postJson('/api/v1/products', [
          'category_id'     => $catId,
          'name'            => 'Shea Butter 250ml',
          'sku'             => 'SB-250',
          'wholesale_price' => 8000,
          'retail_price'    => 12000,
      ])
          ->assertCreated()
          ->assertJsonPath('data.name', 'Shea Butter 250ml')
          ->assertJsonPath('data.wholesale_threshold', 12)
          ->assertJsonPath('data.latest_cost', '0.00');
  });

  it('seller cannot create a product', function () {
      $catId = DB::table('categories')->insertGetId(['name' => 'Cat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->seller()->create());

      $this->postJson('/api/v1/products', [
          'category_id'     => $catId,
          'name'            => 'Soap',
          'wholesale_price' => 1000,
          'retail_price'    => 1500,
      ])->assertForbidden();
  });

  it('any authenticated role can list products', function () {
      Sanctum::actingAs(User::factory()->storeKeeper()->create());
      $this->getJson('/api/v1/products')->assertOk()->assertJsonStructure(['data', 'meta']);
  });

  it('admin can update a product', function () {
      $catId  = DB::table('categories')->insertGetId(['name' => 'Cat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'OldName', 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->admin()->create());

      $this->putJson("/api/v1/products/{$prodId}", ['name' => 'NewName', 'wholesale_price' => 100, 'retail_price' => 150])
          ->assertOk()
          ->assertJsonPath('data.name', 'NewName');
  });

  // ── Batches ───────────────────────────────────────────────────────────────
  it('store_keeper can create a batch for a product', function () {
      $catId  = DB::table('categories')->insertGetId(['name' => 'BC'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'BProduct', 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->storeKeeper()->create());

      $this->postJson("/api/v1/products/{$prodId}/batches", [
          'batch_number' => 'BATCH-001',
          'expiry_date'  => now()->addYear()->toDateString(),
      ])
          ->assertCreated()
          ->assertJsonPath('data.batch_number', 'BATCH-001');
  });

  it('seller cannot create a batch', function () {
      $catId  = DB::table('categories')->insertGetId(['name' => 'BS'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      $prodId = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'BP2', 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->seller()->create());

      $this->postJson("/api/v1/products/{$prodId}/batches", ['batch_number' => 'X'])
          ->assertForbidden();
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL (routes don't exist)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/CatalogueTest.php
  ```

- [ ] **Step 3: Create `backend/app/Models/Category.php`**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\HasMany;

  class Category extends Model
  {
      protected $fillable = ['name'];

      public function products(): HasMany
      {
          return $this->hasMany(Product::class);
      }
  }
  ```

- [ ] **Step 4: Create `backend/app/Models/Product.php`**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;
  use Illuminate\Database\Eloquent\Relations\HasMany;

  class Product extends Model
  {
      protected $fillable = [
          'category_id', 'name', 'sku', 'unit',
          'wholesale_threshold', 'wholesale_price', 'retail_price',
          'latest_cost', 'image_path', 'is_active',
      ];

      protected function casts(): array
      {
          return [
              'wholesale_threshold' => 'integer',
              'wholesale_price'     => 'decimal:2',
              'retail_price'        => 'decimal:2',
              'latest_cost'         => 'decimal:2',
              'is_active'           => 'boolean',
          ];
      }

      public function category(): BelongsTo
      {
          return $this->belongsTo(Category::class);
      }

      public function batches(): HasMany
      {
          return $this->hasMany(Batch::class);
      }

      public function priceTierFor(int $quantity): string
      {
          return $quantity >= $this->wholesale_threshold ? 'wholesale' : 'retail';
      }

      public function priceFor(int $quantity): string
      {
          return $this->priceTierFor($quantity) === 'wholesale'
              ? $this->wholesale_price
              : $this->retail_price;
      }
  }
  ```

- [ ] **Step 5: Create `backend/app/Models/Batch.php`**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class Batch extends Model
  {
      protected $fillable = ['product_id', 'batch_number', 'expiry_date', 'notes'];

      protected function casts(): array
      {
          return ['expiry_date' => 'date'];
      }

      public function product(): BelongsTo
      {
          return $this->belongsTo(Product::class);
      }
  }
  ```

- [ ] **Step 6: Create `backend/app/Policies/ProductPolicy.php`**

  ```php
  <?php

  namespace App\Policies;

  use App\Models\User;

  class ProductPolicy
  {
      public function viewAny(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper', 'seller']);
      }

      public function view(User $user): bool
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

      public function manageBatches(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper']);
      }
  }
  ```

- [ ] **Step 7: Create Form Requests**

  **`backend/app/Http/Requests/Api/V1/StoreProductRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class StoreProductRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return $this->user()->role === 'admin';
      }

      public function rules(): array
      {
          return [
              'category_id'         => ['required', 'integer', 'exists:categories,id'],
              'name'                => ['required', 'string', 'max:200'],
              'sku'                 => ['nullable', 'string', 'max:50', 'unique:products,sku'],
              'unit'                => ['nullable', 'string', 'max:20'],
              'wholesale_threshold' => ['nullable', 'integer', 'min:1'],
              'wholesale_price'     => ['required', 'numeric', 'min:0'],
              'retail_price'        => ['required', 'numeric', 'min:0', 'gte:wholesale_price'],
              'image_path'          => ['nullable', 'string', 'max:255'],
              'is_active'           => ['nullable', 'boolean'],
          ];
      }
  }
  ```

  **`backend/app/Http/Requests/Api/V1/UpdateProductRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class UpdateProductRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return $this->user()->role === 'admin';
      }

      public function rules(): array
      {
          $productId = $this->route('product');

          return [
              'category_id'         => ['sometimes', 'integer', 'exists:categories,id'],
              'name'                => ['sometimes', 'string', 'max:200'],
              'sku'                 => ['nullable', 'string', 'max:50', "unique:products,sku,{$productId}"],
              'unit'                => ['nullable', 'string', 'max:20'],
              'wholesale_threshold' => ['nullable', 'integer', 'min:1'],
              'wholesale_price'     => ['sometimes', 'numeric', 'min:0'],
              'retail_price'        => ['sometimes', 'numeric', 'min:0'],
              'image_path'          => ['nullable', 'string', 'max:255'],
              'is_active'           => ['nullable', 'boolean'],
          ];
      }
  }
  ```

  **`backend/app/Http/Requests/Api/V1/StoreBatchRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use App\Models\Product;
  use Illuminate\Foundation\Http\FormRequest;

  class StoreBatchRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return in_array($this->user()->role, ['admin', 'store_keeper']);
      }

      public function rules(): array
      {
          return [
              'batch_number' => ['nullable', 'string', 'max:50'],
              'expiry_date'  => ['nullable', 'date', 'after:today'],
              'notes'        => ['nullable', 'string'],
          ];
      }
  }
  ```

- [ ] **Step 8: Create controllers**

  **`backend/app/Http/Controllers/Api/V1/CategoryController.php`:**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Models\Category;
  use Illuminate\Http\JsonResponse;

  class CategoryController extends Controller
  {
      public function index(): JsonResponse
      {
          return response()->json([
              'data' => Category::orderBy('name')->get()->map->only(['id', 'name']),
          ]);
      }
  }
  ```

  **`backend/app/Http/Controllers/Api/V1/ProductController.php`:**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StoreProductRequest;
  use App\Http\Requests\Api\V1\UpdateProductRequest;
  use App\Models\Product;
  use Illuminate\Http\JsonResponse;

  class ProductController extends Controller
  {
      private const FIELDS = ['id', 'category_id', 'name', 'sku', 'unit', 'wholesale_threshold',
                               'wholesale_price', 'retail_price', 'latest_cost', 'image_path', 'is_active'];

      public function index(): JsonResponse
      {
          $products = Product::with('category')
              ->orderBy('name')
              ->paginate(50);

          return response()->json($products->through(fn ($p) => array_merge(
              $p->only(self::FIELDS),
              ['category_name' => $p->category?->name]
          )));
      }

      public function store(StoreProductRequest $request): JsonResponse
      {
          $product = Product::create($request->validated());

          return response()->json(['data' => $product->only(self::FIELDS)], 201);
      }

      public function show(Product $product): JsonResponse
      {
          return response()->json(['data' => array_merge(
              $product->only(self::FIELDS),
              ['category_name' => $product->category?->name]
          )]);
      }

      public function update(UpdateProductRequest $request, Product $product): JsonResponse
      {
          $product->update($request->validated());

          return response()->json(['data' => $product->fresh()->only(self::FIELDS)]);
      }

      public function destroy(Product $product): JsonResponse
      {
          $this->authorize('delete', $product);
          $product->delete();

          return response()->json(['message' => 'Product deleted']);
      }
  }
  ```

  **`backend/app/Http/Controllers/Api/V1/BatchController.php`:**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StoreBatchRequest;
  use App\Models\Batch;
  use App\Models\Product;
  use Illuminate\Http\JsonResponse;

  class BatchController extends Controller
  {
      private const FIELDS = ['id', 'product_id', 'batch_number', 'expiry_date', 'notes'];

      public function index(Product $product): JsonResponse
      {
          return response()->json([
              'data' => $product->batches()->orderByDesc('created_at')->get()->map->only(self::FIELDS),
          ]);
      }

      public function store(StoreBatchRequest $request, Product $product): JsonResponse
      {
          $batch = $product->batches()->create($request->validated());

          return response()->json(['data' => $batch->only(self::FIELDS)], 201);
      }
  }
  ```

- [ ] **Step 9: Register policy in `backend/app/Providers/AppServiceProvider.php`**

  ```php
  <?php

  namespace App\Providers;

  use App\Models\Product;
  use App\Policies\ProductPolicy;
  use Illuminate\Support\Facades\Gate;
  use Illuminate\Support\ServiceProvider;

  class AppServiceProvider extends ServiceProvider
  {
      public function boot(): void
      {
          Gate::policy(Product::class, ProductPolicy::class);
      }
  }
  ```

- [ ] **Step 10: Update `backend/routes/api.php`**

  ```php
  <?php

  use App\Http\Controllers\Api\V1\Auth\LoginController;
  use App\Http\Controllers\Api\V1\Auth\LogoutController;
  use App\Http\Controllers\Api\V1\Auth\MeController;
  use App\Http\Controllers\Api\V1\BatchController;
  use App\Http\Controllers\Api\V1\CategoryController;
  use App\Http\Controllers\Api\V1\ProductController;
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

      Route::middleware('auth:sanctum')->group(function () {
          // Catalogue
          Route::get('/categories', [CategoryController::class, 'index'])->name('categories.index');
          Route::apiResource('/products', ProductController::class);
          Route::get('/products/{product}/batches', [BatchController::class, 'index'])->name('products.batches.index');
          Route::post('/products/{product}/batches', [BatchController::class, 'store'])->name('products.batches.store');
      });
  });
  ```

- [ ] **Step 11: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/CatalogueTest.php
  ```

  Expected: 7 tests passing.

- [ ] **Step 12: Run full suite + PHPStan + Pint**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  ```

- [ ] **Step 13: Commit**

  ```bash
  cd ..
  git add backend/app/Models/Category.php backend/app/Models/Product.php backend/app/Models/Batch.php \
          backend/app/Policies/ProductPolicy.php backend/app/Providers/AppServiceProvider.php \
          backend/app/Http/Requests/Api/V1/ backend/app/Http/Controllers/Api/V1/CategoryController.php \
          backend/app/Http/Controllers/Api/V1/ProductController.php \
          backend/app/Http/Controllers/Api/V1/BatchController.php \
          backend/routes/api.php backend/tests/Feature/Api/CatalogueTest.php
  git commit -m "feat(api): product catalogue — categories, products, batches CRUD"
  ```

---

## Task 2: Purchasing & Inventory API

**Files:**
- Create: `backend/app/Models/Location.php`
- Create: `backend/app/Models/Purchase.php`
- Create: `backend/app/Models/PurchaseItem.php`
- Create: `backend/app/Models/StockMovement.php`
- Create: `backend/app/Policies/PurchasePolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StorePurchaseRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/LocationController.php`
- Create: `backend/app/Http/Controllers/Api/V1/PurchaseController.php`
- Create: `backend/app/Http/Controllers/Api/V1/StockController.php`
- Modify: `backend/app/Providers/AppServiceProvider.php` (add Purchase policy)
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/PurchasingTest.php`

**Interfaces:**
- Consumes: `Product` model + `Location` (store) from Task 1
- Produces: `StockMovement::create(...)` (used by Tasks 3 and 4); `Location::where('type','store')->first()` pattern; `GET /api/v1/stock` — consumed by Tasks 3, 4

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/PurchasingTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  function purchasingFixtures(): array
  {
      $storeId = DB::table('locations')->insertGetId(['name' => 'CStore'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $catId   = DB::table('categories')->insertGetId(['name' => 'PurchCat'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      $prodId  = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'PurchProd'.uniqid(), 'wholesale_price' => 1000, 'retail_price' => 1500, 'created_at' => now(), 'updated_at' => now()]);
      $sk      = User::factory()->storeKeeper()->create(['location_id' => $storeId]);
      return compact('storeId', 'catId', 'prodId', 'sk');
  }

  it('store_keeper can record a purchase and stock movement is created', function () {
      $f = purchasingFixtures();
      Sanctum::actingAs($f['sk']);

      $response = $this->postJson('/api/v1/purchases', [
          'purchase_date' => today()->toDateString(),
          'supplier_name' => 'ABC Supplies',
          'items' => [
              ['product_id' => $f['prodId'], 'quantity' => 20, 'unit_cost' => 800],
          ],
      ]);

      $response->assertCreated()->assertJsonPath('data.supplier_name', 'ABC Supplies');

      // Verify stock movement created
      $movement = DB::table('stock_movements')
          ->where('product_id', $f['prodId'])
          ->where('location_id', $f['storeId'])
          ->where('movement_type', 'purchase')
          ->first();

      expect($movement)->not->toBeNull();
      expect((int) $movement->quantity)->toBe(20);
  });

  it('purchase triggers latest_cost update on product', function () {
      $f = purchasingFixtures();
      Sanctum::actingAs($f['sk']);

      $this->postJson('/api/v1/purchases', [
          'purchase_date' => today()->toDateString(),
          'items' => [
              ['product_id' => $f['prodId'], 'quantity' => 10, 'unit_cost' => 950.50],
          ],
      ])->assertCreated();

      $latestCost = DB::table('products')->where('id', $f['prodId'])->value('latest_cost');
      expect((float) $latestCost)->toBe(950.50);
  });

  it('seller cannot record a purchase', function () {
      $f = purchasingFixtures();
      Sanctum::actingAs(User::factory()->seller()->create(['location_id' => $f['storeId']]));

      $this->postJson('/api/v1/purchases', [
          'purchase_date' => today()->toDateString(),
          'items' => [['product_id' => $f['prodId'], 'quantity' => 5, 'unit_cost' => 100]],
      ])->assertForbidden();
  });

  it('authenticated user can view current stock', function () {
      Sanctum::actingAs(User::factory()->seller()->create());
      $this->getJson('/api/v1/stock')->assertOk()->assertJsonStructure(['data']);
  });

  it('authenticated user can view expiry alerts', function () {
      Sanctum::actingAs(User::factory()->admin()->create());
      $this->getJson('/api/v1/stock/alerts/expiry')->assertOk()->assertJsonStructure(['data']);
  });

  it('authenticated user can list locations', function () {
      Sanctum::actingAs(User::factory()->seller()->create());
      $this->getJson('/api/v1/locations')->assertOk()->assertJsonStructure(['data']);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/PurchasingTest.php
  ```

- [ ] **Step 3: Create models**

  **`backend/app/Models/Location.php`:**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;

  class Location extends Model
  {
      protected $fillable = ['name', 'type', 'address', 'geofence_lat', 'geofence_lng', 'geofence_radius_m', 'is_active'];

      protected function casts(): array
      {
          return [
              'geofence_lat'       => 'decimal:8',
              'geofence_lng'       => 'decimal:8',
              'geofence_radius_m'  => 'integer',
              'is_active'          => 'boolean',
          ];
      }

      public function scopeActive($query)
      {
          return $query->where('is_active', true);
      }
  }
  ```

  **`backend/app/Models/Purchase.php`:**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;
  use Illuminate\Database\Eloquent\Relations\HasMany;

  class Purchase extends Model
  {
      protected $fillable = ['purchased_by', 'supplier_name', 'invoice_number', 'purchase_date', 'notes'];

      protected function casts(): array
      {
          return ['purchase_date' => 'date'];
      }

      public function purchasedBy(): BelongsTo
      {
          return $this->belongsTo(User::class, 'purchased_by');
      }

      public function items(): HasMany
      {
          return $this->hasMany(PurchaseItem::class);
      }
  }
  ```

  **`backend/app/Models/PurchaseItem.php`:**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class PurchaseItem extends Model
  {
      protected $fillable = ['purchase_id', 'product_id', 'batch_id', 'quantity', 'unit_cost'];

      protected function casts(): array
      {
          return [
              'quantity'  => 'integer',
              'unit_cost' => 'decimal:2',
          ];
      }

      public function product(): BelongsTo
      {
          return $this->belongsTo(Product::class);
      }
  }
  ```

  **`backend/app/Models/StockMovement.php`:**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;

  class StockMovement extends Model
  {
      public $timestamps = false; // immutable: only created_at, set by DB default

      protected $fillable = [
          'product_id', 'location_id', 'movement_type', 'quantity',
          'reference_type', 'reference_id', 'batch_id', 'unit_cost',
          'performed_by', 'notes',
      ];

      protected function casts(): array
      {
          return [
              'quantity'  => 'integer',
              'unit_cost' => 'decimal:2',
          ];
      }
  }
  ```

- [ ] **Step 4: Create `backend/app/Policies/PurchasePolicy.php`**

  ```php
  <?php

  namespace App\Policies;

  use App\Models\User;

  class PurchasePolicy
  {
      public function viewAny(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper']);
      }

      public function view(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper']);
      }

      public function create(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper']);
      }
  }
  ```

- [ ] **Step 5: Create `backend/app/Http/Requests/Api/V1/StorePurchaseRequest.php`**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class StorePurchaseRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return in_array($this->user()->role, ['admin', 'store_keeper']);
      }

      public function rules(): array
      {
          return [
              'purchase_date'          => ['required', 'date'],
              'supplier_name'          => ['nullable', 'string', 'max:100'],
              'invoice_number'         => ['nullable', 'string', 'max:50'],
              'notes'                  => ['nullable', 'string'],
              'items'                  => ['required', 'array', 'min:1'],
              'items.*.product_id'     => ['required', 'integer', 'exists:products,id'],
              'items.*.quantity'       => ['required', 'integer', 'min:1'],
              'items.*.unit_cost'      => ['required', 'numeric', 'min:0'],
              'items.*.batch_id'       => ['nullable', 'integer', 'exists:batches,id'],
              'items.*.batch_number'   => ['nullable', 'string', 'max:50'],
              'items.*.expiry_date'    => ['nullable', 'date'],
          ];
      }
  }
  ```

- [ ] **Step 6: Create `backend/app/Http/Controllers/Api/V1/PurchaseController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StorePurchaseRequest;
  use App\Models\Batch;
  use App\Models\Location;
  use App\Models\Purchase;
  use App\Models\PurchaseItem;
  use App\Models\StockMovement;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Support\Facades\DB;

  class PurchaseController extends Controller
  {
      public function index(): JsonResponse
      {
          $this->authorize('viewAny', Purchase::class);
          $purchases = Purchase::with('items')->latest()->paginate(50);

          return response()->json($purchases->through(fn ($p) => $p->only([
              'id', 'purchased_by', 'supplier_name', 'invoice_number', 'purchase_date', 'notes',
          ])));
      }

      public function show(Purchase $purchase): JsonResponse
      {
          $this->authorize('view', $purchase);

          return response()->json(['data' => array_merge(
              $purchase->only(['id', 'purchased_by', 'supplier_name', 'invoice_number', 'purchase_date', 'notes']),
              ['items' => $purchase->items->map->only(['id', 'product_id', 'batch_id', 'quantity', 'unit_cost'])],
          )]);
      }

      public function store(StorePurchaseRequest $request): JsonResponse
      {
          $user     = $request->user();
          $store    = Location::where('type', 'store')->firstOrFail();
          $validated = $request->validated();

          $purchase = DB::transaction(function () use ($validated, $user, $store) {
              $purchase = Purchase::create([
                  'purchased_by'   => $user->id,
                  'supplier_name'  => $validated['supplier_name'] ?? null,
                  'invoice_number' => $validated['invoice_number'] ?? null,
                  'purchase_date'  => $validated['purchase_date'],
                  'notes'          => $validated['notes'] ?? null,
              ]);

              foreach ($validated['items'] as $item) {
                  $batchId = $item['batch_id'] ?? null;

                  if ($batchId === null && (!empty($item['expiry_date']) || !empty($item['batch_number']))) {
                      $batch   = Batch::create([
                          'product_id'   => $item['product_id'],
                          'batch_number' => $item['batch_number'] ?? null,
                          'expiry_date'  => $item['expiry_date'] ?? null,
                      ]);
                      $batchId = $batch->id;
                  }

                  PurchaseItem::create([
                      'purchase_id' => $purchase->id,
                      'product_id'  => $item['product_id'],
                      'batch_id'    => $batchId,
                      'quantity'    => $item['quantity'],
                      'unit_cost'   => $item['unit_cost'],
                  ]);
                  // ↑ triggers fn_update_product_latest_cost() automatically

                  StockMovement::create([
                      'product_id'     => $item['product_id'],
                      'location_id'    => $store->id,
                      'movement_type'  => 'purchase',
                      'quantity'       => $item['quantity'],
                      'reference_type' => 'purchase',
                      'reference_id'   => $purchase->id,
                      'batch_id'       => $batchId,
                      'unit_cost'      => $item['unit_cost'],
                      'performed_by'   => $user->id,
                  ]);
              }

              return $purchase;
          });

          return response()->json([
              'data' => $purchase->only(['id', 'purchased_by', 'supplier_name', 'invoice_number', 'purchase_date', 'notes']),
          ], 201);
      }
  }
  ```

- [ ] **Step 7: Create `backend/app/Http/Controllers/Api/V1/StockController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Support\Facades\DB;

  class StockController extends Controller
  {
      public function index(): JsonResponse
      {
          $rows = DB::table('v_current_stock')->get();

          return response()->json(['data' => $rows]);
      }

      public function expiry(): JsonResponse
      {
          $rows = DB::table('v_expiry_alerts')->orderBy('days_until_expiry')->get();

          return response()->json(['data' => $rows]);
      }

      public function low(): JsonResponse
      {
          $rows = DB::table('v_low_stock_alerts')->orderBy('days_of_cover')->get();

          return response()->json(['data' => $rows]);
      }
  }
  ```

- [ ] **Step 8: Create `backend/app/Http/Controllers/Api/V1/LocationController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Models\Location;
  use Illuminate\Http\JsonResponse;

  class LocationController extends Controller
  {
      public function index(): JsonResponse
      {
          return response()->json([
              'data' => Location::active()->orderBy('type')->orderBy('name')->get()
                  ->map->only(['id', 'name', 'type', 'geofence_radius_m', 'is_active']),
          ]);
      }
  }
  ```

- [ ] **Step 9: Update AppServiceProvider + routes**

  Add to `AppServiceProvider::boot()`:
  ```php
  use App\Models\Purchase;
  use App\Policies\PurchasePolicy;
  // ...
  Gate::policy(Purchase::class, PurchasePolicy::class);
  ```

  Add to `routes/api.php` inside the `auth:sanctum` group:
  ```php
  use App\Http\Controllers\Api\V1\LocationController;
  use App\Http\Controllers\Api\V1\PurchaseController;
  use App\Http\Controllers\Api\V1\StockController;
  // ...
  Route::get('/locations', [LocationController::class, 'index'])->name('locations.index');
  Route::apiResource('/purchases', PurchaseController::class)->only(['index', 'show', 'store']);
  Route::get('/stock', [StockController::class, 'index'])->name('stock.index');
  Route::get('/stock/alerts/expiry', [StockController::class, 'expiry'])->name('stock.expiry');
  Route::get('/stock/alerts/low', [StockController::class, 'low'])->name('stock.low');
  ```

- [ ] **Step 10: Run tests — expect PASS, then full suite + PHPStan + Pint + Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/PurchasingTest.php
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  ```

  Then commit:
  ```bash
  cd ..
  git add backend/app/Models/ backend/app/Policies/PurchasePolicy.php \
          backend/app/Http/Requests/Api/V1/StorePurchaseRequest.php \
          backend/app/Http/Controllers/Api/V1/LocationController.php \
          backend/app/Http/Controllers/Api/V1/PurchaseController.php \
          backend/app/Http/Controllers/Api/V1/StockController.php \
          backend/app/Providers/AppServiceProvider.php \
          backend/routes/api.php backend/tests/Feature/Api/PurchasingTest.php
  git commit -m "feat(api): purchasing workflow — locations, purchases, stock movements, inventory views"
  ```

---

## Task 3: Distribution Workflow API

**Files:**
- Create: `backend/app/Models/Distribution.php`
- Create: `backend/app/Models/DistributionItem.php`
- Create: `backend/app/Policies/DistributionPolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreDistributionRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/ConfirmDistributionRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/DistributionController.php`
- Create: `backend/app/Http/Controllers/Api/V1/ConfirmDistributionController.php`
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/DistributionTest.php`

**Interfaces:**
- Consumes: `StockMovement::create(...)`, `Location`, `Product` from Tasks 1–2
- Produces: distribution pending/confirmed state machine; `GET /api/v1/distributions` (all roles); `POST /api/v1/distributions/{id}/confirm` (seller)

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/DistributionTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  function distFixtures(): array
  {
      $storeId = DB::table('locations')->insertGetId(['name' => 'Store'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $shopId  = DB::table('locations')->insertGetId(['name' => 'Shop'.uniqid(),  'type' => 'shop',  'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $catId   = DB::table('categories')->insertGetId(['name' => 'DC'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      $prodId  = DB::table('products')->insertGetId(['category_id' => $catId, 'name' => 'DP'.uniqid(), 'wholesale_price' => 100, 'retail_price' => 150, 'created_at' => now(), 'updated_at' => now()]);
      $sk      = User::factory()->storeKeeper()->create(['location_id' => $storeId]);
      $seller  = User::factory()->seller()->create(['location_id' => $shopId]);

      // Add stock at store
      DB::table('stock_movements')->insert(['product_id' => $prodId, 'location_id' => $storeId, 'movement_type' => 'purchase', 'quantity' => 50, 'reference_type' => 'purchase', 'reference_id' => 1, 'unit_cost' => 80, 'performed_by' => $sk->id, 'created_at' => now()]);

      return compact('storeId', 'shopId', 'catId', 'prodId', 'sk', 'seller');
  }

  it('store_keeper can create a distribution (status=pending, stock_out movement created)', function () {
      $f = distFixtures();
      Sanctum::actingAs($f['sk']);

      $response = $this->postJson('/api/v1/distributions', [
          'to_location_id'  => $f['shopId'],
          'distributed_at'  => now()->toIso8601String(),
          'items' => [
              ['product_id' => $f['prodId'], 'quantity_sent' => 10],
          ],
      ]);

      $response->assertCreated()->assertJsonPath('data.status', 'pending');

      $outMovement = DB::table('stock_movements')
          ->where('product_id', $f['prodId'])
          ->where('movement_type', 'distribution_out')
          ->first();

      expect($outMovement)->not->toBeNull();
      expect((int) $outMovement->quantity)->toBe(-10);
  });

  it('seller cannot create a distribution', function () {
      $f = distFixtures();
      Sanctum::actingAs($f['seller']);

      $this->postJson('/api/v1/distributions', [
          'to_location_id' => $f['shopId'],
          'distributed_at' => now()->toIso8601String(),
          'items' => [['product_id' => $f['prodId'], 'quantity_sent' => 5]],
      ])->assertForbidden();
  });

  it('seller can confirm a distribution (stock_in movement created)', function () {
      $f = distFixtures();

      // Create a pending distribution as store_keeper
      Sanctum::actingAs($f['sk']);
      $distRes = $this->postJson('/api/v1/distributions', [
          'to_location_id' => $f['shopId'],
          'distributed_at' => now()->toIso8601String(),
          'items' => [['product_id' => $f['prodId'], 'quantity_sent' => 10]],
      ]);
      $distId = $distRes->json('data.id');

      // Confirm as seller
      Sanctum::actingAs($f['seller']);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$f[shopId]]), false)");

      try {
          $this->postJson("/api/v1/distributions/{$distId}/confirm", [
              'items' => [
                  ['distribution_item_id' => DB::table('distribution_items')->where('distribution_id', $distId)->value('id'), 'quantity_received' => 10],
              ],
          ])->assertOk()->assertJsonPath('data.status', 'confirmed');

          $inMovement = DB::table('stock_movements')
              ->where('product_id', $f['prodId'])
              ->where('movement_type', 'distribution_in')
              ->first();

          expect($inMovement)->not->toBeNull();
          expect((int) $inMovement->quantity)->toBe(10);
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('any authenticated role can list distributions', function () {
      Sanctum::actingAs(User::factory()->seller()->create());
      $this->getJson('/api/v1/distributions')->assertOk()->assertJsonStructure(['data']);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/DistributionTest.php
  ```

- [ ] **Step 3: Create models**

  **`backend/app/Models/Distribution.php`:**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;
  use Illuminate\Database\Eloquent\Relations\HasMany;

  class Distribution extends Model
  {
      protected $fillable = [
          'from_location_id', 'to_location_id', 'distributed_by',
          'confirmed_by', 'status', 'distributed_at', 'confirmed_at', 'notes',
      ];

      protected function casts(): array
      {
          return [
              'distributed_at' => 'datetime',
              'confirmed_at'   => 'datetime',
          ];
      }

      public function fromLocation(): BelongsTo
      {
          return $this->belongsTo(Location::class, 'from_location_id');
      }

      public function toLocation(): BelongsTo
      {
          return $this->belongsTo(Location::class, 'to_location_id');
      }

      public function items(): HasMany
      {
          return $this->hasMany(DistributionItem::class);
      }
  }
  ```

  **`backend/app/Models/DistributionItem.php`:**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class DistributionItem extends Model
  {
      protected $fillable = ['distribution_id', 'product_id', 'batch_id', 'quantity_sent', 'quantity_received'];

      protected function casts(): array
      {
          return [
              'quantity_sent'     => 'integer',
              'quantity_received' => 'integer',
          ];
      }

      public function product(): BelongsTo
      {
          return $this->belongsTo(Product::class);
      }
  }
  ```

- [ ] **Step 4: Create `backend/app/Policies/DistributionPolicy.php`**

  ```php
  <?php

  namespace App\Policies;

  use App\Models\Distribution;
  use App\Models\User;

  class DistributionPolicy
  {
      public function viewAny(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper', 'seller']);
      }

      public function create(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper']);
      }

      public function confirm(User $user, Distribution $distribution): bool
      {
          return $user->role === 'seller'
              && $distribution->status === 'pending'
              && $distribution->to_location_id === $user->location_id;
      }
  }
  ```

- [ ] **Step 5: Create Form Requests**

  **`backend/app/Http/Requests/Api/V1/StoreDistributionRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class StoreDistributionRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return in_array($this->user()->role, ['admin', 'store_keeper']);
      }

      public function rules(): array
      {
          return [
              'to_location_id'       => ['required', 'integer', 'exists:locations,id', 'different:from_location_id'],
              'distributed_at'       => ['required', 'date'],
              'notes'                => ['nullable', 'string'],
              'items'                => ['required', 'array', 'min:1'],
              'items.*.product_id'   => ['required', 'integer', 'exists:products,id'],
              'items.*.batch_id'     => ['nullable', 'integer', 'exists:batches,id'],
              'items.*.quantity_sent' => ['required', 'integer', 'min:1'],
          ];
      }
  }
  ```

  **`backend/app/Http/Requests/Api/V1/ConfirmDistributionRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class ConfirmDistributionRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return $this->user()->role === 'seller';
      }

      public function rules(): array
      {
          return [
              'items'                              => ['required', 'array', 'min:1'],
              'items.*.distribution_item_id'       => ['required', 'integer', 'exists:distribution_items,id'],
              'items.*.quantity_received'          => ['required', 'integer', 'min:0'],
          ];
      }
  }
  ```

- [ ] **Step 6: Create `backend/app/Http/Controllers/Api/V1/DistributionController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StoreDistributionRequest;
  use App\Models\Distribution;
  use App\Models\DistributionItem;
  use App\Models\Location;
  use App\Models\StockMovement;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Support\Facades\DB;

  class DistributionController extends Controller
  {
      private const FIELDS = ['id', 'from_location_id', 'to_location_id', 'distributed_by',
                               'confirmed_by', 'status', 'distributed_at', 'confirmed_at', 'notes'];

      public function index(): JsonResponse
      {
          $this->authorize('viewAny', Distribution::class);
          $distributions = Distribution::latest()->paginate(50);

          return response()->json($distributions->through(fn ($d) => $d->only(self::FIELDS)));
      }

      public function show(Distribution $distribution): JsonResponse
      {
          $this->authorize('viewAny', Distribution::class);

          return response()->json(['data' => array_merge(
              $distribution->only(self::FIELDS),
              ['items' => $distribution->items->map->only(['id', 'product_id', 'batch_id', 'quantity_sent', 'quantity_received'])],
          )]);
      }

      public function store(StoreDistributionRequest $request): JsonResponse
      {
          $user      = $request->user();
          $store     = Location::where('type', 'store')->firstOrFail();
          $validated = $request->validated();

          $distribution = DB::transaction(function () use ($validated, $user, $store) {
              $distribution = Distribution::create([
                  'from_location_id' => $store->id,
                  'to_location_id'   => $validated['to_location_id'],
                  'distributed_by'   => $user->id,
                  'status'           => 'pending',
                  'distributed_at'   => $validated['distributed_at'],
                  'notes'            => $validated['notes'] ?? null,
              ]);

              foreach ($validated['items'] as $item) {
                  DistributionItem::create([
                      'distribution_id' => $distribution->id,
                      'product_id'      => $item['product_id'],
                      'batch_id'        => $item['batch_id'] ?? null,
                      'quantity_sent'   => $item['quantity_sent'],
                  ]);

                  StockMovement::create([
                      'product_id'     => $item['product_id'],
                      'location_id'    => $store->id,
                      'movement_type'  => 'distribution_out',
                      'quantity'       => -$item['quantity_sent'],
                      'reference_type' => 'distribution',
                      'reference_id'   => $distribution->id,
                      'batch_id'       => $item['batch_id'] ?? null,
                      'unit_cost'      => 0,
                      'performed_by'   => $user->id,
                  ]);
              }

              return $distribution;
          });

          return response()->json(['data' => $distribution->only(self::FIELDS)], 201);
      }
  }
  ```

- [ ] **Step 7: Create `backend/app/Http/Controllers/Api/V1/ConfirmDistributionController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\ConfirmDistributionRequest;
  use App\Models\Distribution;
  use App\Models\DistributionItem;
  use App\Models\StockMovement;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Support\Facades\DB;

  class ConfirmDistributionController extends Controller
  {
      public function __invoke(ConfirmDistributionRequest $request, Distribution $distribution): JsonResponse
      {
          $this->authorize('confirm', $distribution);

          $user = $request->user();
          $itemsData = collect($request->validated()['items'])->keyBy('distribution_item_id');

          DB::transaction(function () use ($distribution, $itemsData, $user) {
              foreach ($distribution->items as $distItem) {
                  $received = $itemsData->get($distItem->id)['quantity_received'] ?? $distItem->quantity_sent;

                  $distItem->update(['quantity_received' => $received]);

                  StockMovement::create([
                      'product_id'     => $distItem->product_id,
                      'location_id'    => $distribution->to_location_id,
                      'movement_type'  => 'distribution_in',
                      'quantity'       => $received,
                      'reference_type' => 'distribution',
                      'reference_id'   => $distribution->id,
                      'batch_id'       => $distItem->batch_id,
                      'unit_cost'      => 0,
                      'performed_by'   => $user->id,
                  ]);
              }

              $hasDiscrepancy = $distribution->items->fresh()
                  ->some(fn ($i) => $i->quantity_received !== $i->quantity_sent);

              $distribution->update([
                  'status'       => $hasDiscrepancy ? 'discrepancy' : 'confirmed',
                  'confirmed_by' => $user->id,
                  'confirmed_at' => now(),
              ]);
          });

          return response()->json(['data' => $distribution->fresh()->only([
              'id', 'status', 'confirmed_by', 'confirmed_at',
          ])]);
      }
  }
  ```

- [ ] **Step 8: Register policy + routes**

  Add to `AppServiceProvider::boot()`:
  ```php
  use App\Models\Distribution;
  use App\Policies\DistributionPolicy;
  Gate::policy(Distribution::class, DistributionPolicy::class);
  ```

  Add to `routes/api.php` inside `auth:sanctum` group:
  ```php
  use App\Http\Controllers\Api\V1\ConfirmDistributionController;
  use App\Http\Controllers\Api\V1\DistributionController;
  Route::apiResource('/distributions', DistributionController::class)->only(['index', 'show', 'store']);
  Route::post('/distributions/{distribution}/confirm', ConfirmDistributionController::class)->name('distributions.confirm');
  ```

- [ ] **Step 9: Run tests — PASS, full suite, PHPStan, Pint, Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/DistributionTest.php
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  ```

  ```bash
  cd ..
  git add backend/app/Models/Distribution.php backend/app/Models/DistributionItem.php \
          backend/app/Policies/DistributionPolicy.php \
          backend/app/Http/Requests/Api/V1/StoreDistributionRequest.php \
          backend/app/Http/Requests/Api/V1/ConfirmDistributionRequest.php \
          backend/app/Http/Controllers/Api/V1/DistributionController.php \
          backend/app/Http/Controllers/Api/V1/ConfirmDistributionController.php \
          backend/app/Providers/AppServiceProvider.php \
          backend/routes/api.php backend/tests/Feature/Api/DistributionTest.php
  git commit -m "feat(api): distribution workflow — create, confirm, discrepancy with stock movements"
  ```

---

## Task 4: POS, Clients & Sale Revert

**Files:**
- Create: `backend/app/Models/Client.php`
- Create: `backend/app/Models/Sale.php`
- Create: `backend/app/Models/SaleItem.php`
- Create: `backend/app/Policies/SalePolicy.php`
- Create: `backend/app/Policies/ClientPolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreSaleRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/RevertSaleRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreClientRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/SaleController.php`
- Create: `backend/app/Http/Controllers/Api/V1/RevertSaleController.php`
- Create: `backend/app/Http/Controllers/Api/V1/ClientController.php`
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/SalesTest.php`

**Interfaces:**
- Consumes: `Product::priceTierFor(int)`, `Product::priceFor(int)`, `StockMovement::create(...)` from Tasks 1–2
- Produces: `Sale` with `is_reverted`, `GET /api/v1/sales`, `POST /api/v1/sales`, `POST /api/v1/sales/{id}/revert` (admin)

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/SalesTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  function salesFixtures(): array
  {
      $shopId  = DB::table('locations')->insertGetId(['name' => 'Shop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $catId   = DB::table('categories')->insertGetId(['name' => 'SC'.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
      $prodId  = DB::table('products')->insertGetId([
          'category_id' => $catId, 'name' => 'SP'.uniqid(),
          'wholesale_price' => 8000, 'retail_price' => 12000,
          'wholesale_threshold' => 12, 'latest_cost' => 6000,
          'created_at' => now(), 'updated_at' => now(),
      ]);
      $seller  = User::factory()->seller()->create(['location_id' => $shopId]);
      $admin   = User::factory()->admin()->create();

      // Give shop some stock
      DB::table('stock_movements')->insert(['product_id' => $prodId, 'location_id' => $shopId, 'movement_type' => 'distribution_in', 'quantity' => 50, 'reference_type' => 'distribution', 'reference_id' => 1, 'unit_cost' => 6000, 'performed_by' => $seller->id, 'created_at' => now()]);

      return compact('shopId', 'prodId', 'seller', 'admin');
  }

  it('seller can create a sale (retail tier — qty below threshold)', function () {
      $f = salesFixtures();
      Sanctum::actingAs($f['seller']);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$f[shopId]]), false)");

      try {
          $response = $this->postJson('/api/v1/sales', [
              'payment_method' => 'nmb',
              'sale_date'      => today()->toDateString(),
              'items' => [
                  ['product_id' => $f['prodId'], 'quantity' => 2],
              ],
          ]);

          $response->assertCreated()
              ->assertJsonPath('data.total_amount', '24000.00'); // 2 × 12000 retail
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('sale at wholesale threshold uses wholesale price', function () {
      $f = salesFixtures();
      Sanctum::actingAs($f['seller']);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$f[shopId]]), false)");

      try {
          $response = $this->postJson('/api/v1/sales', [
              'payment_method' => 'airtel',
              'sale_date'      => today()->toDateString(),
              'items' => [
                  ['product_id' => $f['prodId'], 'quantity' => 12], // exactly threshold
              ],
          ]);

          $response->assertCreated()
              ->assertJsonPath('data.total_amount', '96000.00'); // 12 × 8000 wholesale
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('sale creates a stock_out movement at seller location', function () {
      $f = salesFixtures();
      Sanctum::actingAs($f['seller']);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$f[shopId]]), false)");

      try {
          $this->postJson('/api/v1/sales', [
              'payment_method' => 'tigo',
              'sale_date'      => today()->toDateString(),
              'items' => [['product_id' => $f['prodId'], 'quantity' => 3]],
          ])->assertCreated();

          $movement = DB::table('stock_movements')
              ->where('product_id', $f['prodId'])
              ->where('location_id', $f['shopId'])
              ->where('movement_type', 'sale')
              ->first();

          expect($movement)->not->toBeNull();
          expect((int) $movement->quantity)->toBe(-3);
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('admin can revert a sale and stock is restored', function () {
      $f = salesFixtures();
      Sanctum::actingAs($f['seller']);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$f[shopId]]), false)");

      $saleRes = $this->postJson('/api/v1/sales', [
          'payment_method' => 'nmb',
          'sale_date'      => today()->toDateString(),
          'items'          => [['product_id' => $f['prodId'], 'quantity' => 5]],
      ]);
      $saleId = $saleRes->json('data.id');

      DB::unprepared('RESET app.role');
      DB::unprepared('RESET app.location_ids');

      Sanctum::actingAs($f['admin']);
      $this->postJson("/api/v1/sales/{$saleId}/revert", ['reason' => 'Customer returned goods'])
          ->assertOk()
          ->assertJsonPath('data.is_reverted', true);

      $revertMovement = DB::table('stock_movements')
          ->where('product_id', $f['prodId'])
          ->where('movement_type', 'sale_revert')
          ->first();
      expect($revertMovement)->not->toBeNull();
      expect((int) $revertMovement->quantity)->toBe(5);
  });

  it('seller cannot revert a sale', function () {
      $f = salesFixtures();
      $saleId = DB::table('sales')->insertGetId([
          'location_id' => $f['shopId'], 'sold_by' => $f['seller']->id,
          'payment_method' => 'nmb', 'total_amount' => 1000, 'sale_date' => today(),
          'created_at' => now(), 'updated_at' => now(),
      ]);
      Sanctum::actingAs($f['seller']);

      $this->postJson("/api/v1/sales/{$saleId}/revert", ['reason' => 'x'])
          ->assertForbidden();
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/SalesTest.php
  ```

- [ ] **Step 3: Create models**

  **`backend/app/Models/Client.php`:**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class Client extends Model
  {
      protected $fillable = ['location_id', 'name', 'phone', 'notes', 'is_active'];

      protected function casts(): array
      {
          return ['is_active' => 'boolean'];
      }

      public function location(): BelongsTo
      {
          return $this->belongsTo(Location::class);
      }
  }
  ```

  **`backend/app/Models/Sale.php`:**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;
  use Illuminate\Database\Eloquent\Relations\HasMany;

  class Sale extends Model
  {
      protected $fillable = [
          'location_id', 'sold_by', 'client_id', 'payment_method',
          'total_amount', 'discount_amount', 'is_reverted',
          'reverted_by', 'reverted_at', 'revert_reason', 'sale_date',
      ];

      protected function casts(): array
      {
          return [
              'total_amount'    => 'decimal:2',
              'discount_amount' => 'decimal:2',
              'is_reverted'     => 'boolean',
              'reverted_at'     => 'datetime',
              'sale_date'       => 'date',
          ];
      }

      public function items(): HasMany
      {
          return $this->hasMany(SaleItem::class);
      }

      public function location(): BelongsTo
      {
          return $this->belongsTo(Location::class);
      }
  }
  ```

  **`backend/app/Models/SaleItem.php`:**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class SaleItem extends Model
  {
      public $timestamps = false; // immutable — only created_at, set by DB

      protected $fillable = [
          'sale_id', 'product_id', 'batch_id',
          'quantity', 'unit_price', 'unit_cost', 'price_tier',
      ];

      protected function casts(): array
      {
          return [
              'quantity'   => 'integer',
              'unit_price' => 'decimal:2',
              'unit_cost'  => 'decimal:2',
          ];
      }

      public function product(): BelongsTo
      {
          return $this->belongsTo(Product::class);
      }
  }
  ```

- [ ] **Step 4: Create policies**

  **`backend/app/Policies/SalePolicy.php`:**

  ```php
  <?php

  namespace App\Policies;

  use App\Models\Sale;
  use App\Models\User;

  class SalePolicy
  {
      public function viewAny(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper', 'seller']);
      }

      public function create(User $user): bool
      {
          return in_array($user->role, ['admin', 'seller']);
      }

      public function revert(User $user, Sale $sale): bool
      {
          return $user->role === 'admin' && ! $sale->is_reverted;
      }
  }
  ```

  **`backend/app/Policies/ClientPolicy.php`:**

  ```php
  <?php

  namespace App\Policies;

  use App\Models\User;

  class ClientPolicy
  {
      public function viewAny(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper', 'seller']);
      }

      public function create(User $user): bool
      {
          return in_array($user->role, ['admin', 'seller']);
      }

      public function update(User $user): bool
      {
          return in_array($user->role, ['admin', 'seller']);
      }
  }
  ```

- [ ] **Step 5: Create Form Requests**

  **`backend/app/Http/Requests/Api/V1/StoreSaleRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class StoreSaleRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return in_array($this->user()->role, ['admin', 'seller']);
      }

      public function rules(): array
      {
          return [
              'payment_method'    => ['required', 'in:nmb,airtel,vodacom,tigo'],
              'sale_date'         => ['required', 'date'],
              'client_id'         => ['nullable', 'integer', 'exists:clients,id'],
              'discount_amount'   => ['nullable', 'numeric', 'min:0'],
              'items'             => ['required', 'array', 'min:1'],
              'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
              'items.*.quantity'  => ['required', 'integer', 'min:1'],
              'items.*.batch_id'  => ['nullable', 'integer', 'exists:batches,id'],
          ];
      }
  }
  ```

  **`backend/app/Http/Requests/Api/V1/RevertSaleRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class RevertSaleRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return $this->user()->role === 'admin';
      }

      public function rules(): array
      {
          return [
              'reason' => ['required', 'string', 'min:5'],
          ];
      }
  }
  ```

  **`backend/app/Http/Requests/Api/V1/StoreClientRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class StoreClientRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return in_array($this->user()->role, ['admin', 'seller']);
      }

      public function rules(): array
      {
          return [
              'name'  => ['required', 'string', 'max:100'],
              'phone' => ['nullable', 'string', 'max:20'],
              'notes' => ['nullable', 'string'],
          ];
      }
  }
  ```

- [ ] **Step 6: Create `backend/app/Http/Controllers/Api/V1/SaleController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StoreSaleRequest;
  use App\Models\Product;
  use App\Models\Sale;
  use App\Models\SaleItem;
  use App\Models\StockMovement;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Support\Facades\DB;

  class SaleController extends Controller
  {
      private const FIELDS = ['id', 'location_id', 'sold_by', 'client_id', 'payment_method',
                               'total_amount', 'discount_amount', 'is_reverted', 'sale_date'];

      public function index(): JsonResponse
      {
          $this->authorize('viewAny', Sale::class);
          $sales = Sale::latest()->paginate(50);

          return response()->json($sales->through(fn ($s) => $s->only(self::FIELDS)));
      }

      public function show(Sale $sale): JsonResponse
      {
          $this->authorize('viewAny', Sale::class);

          return response()->json(['data' => array_merge(
              $sale->only(self::FIELDS),
              ['items' => $sale->items->map->only(['id', 'product_id', 'batch_id', 'quantity', 'unit_price', 'unit_cost', 'price_tier'])],
          )]);
      }

      public function store(StoreSaleRequest $request): JsonResponse
      {
          $user      = $request->user();
          $validated = $request->validated();

          $sale = DB::transaction(function () use ($validated, $user) {
              $totalAmount   = '0';
              $itemsToInsert = [];

              foreach ($validated['items'] as $item) {
                  $product   = Product::findOrFail($item['product_id']);
                  $priceTier = $product->priceTierFor($item['quantity']);
                  $unitPrice = $product->priceFor($item['quantity']);
                  $lineTotal = bcmul((string) $unitPrice, (string) $item['quantity'], 2);
                  $totalAmount = bcadd($totalAmount, $lineTotal, 2);

                  $itemsToInsert[] = [
                      'product_id' => $item['product_id'],
                      'batch_id'   => $item['batch_id'] ?? null,
                      'quantity'   => $item['quantity'],
                      'unit_price' => $unitPrice,
                      'unit_cost'  => $product->latest_cost,
                      'price_tier' => $priceTier,
                  ];
              }

              $discount = $validated['discount_amount'] ?? 0;

              $sale = Sale::create([
                  'location_id'     => $user->location_id,
                  'sold_by'         => $user->id,
                  'client_id'       => $validated['client_id'] ?? null,
                  'payment_method'  => $validated['payment_method'],
                  'total_amount'    => bcsub($totalAmount, (string) $discount, 2),
                  'discount_amount' => $discount,
                  'sale_date'       => $validated['sale_date'],
              ]);

              foreach ($itemsToInsert as $itemData) {
                  $saleItem = $sale->items()->create($itemData);

                  StockMovement::create([
                      'product_id'     => $itemData['product_id'],
                      'location_id'    => $user->location_id,
                      'movement_type'  => 'sale',
                      'quantity'       => -$itemData['quantity'],
                      'reference_type' => 'sale',
                      'reference_id'   => $sale->id,
                      'batch_id'       => $itemData['batch_id'],
                      'unit_cost'      => $itemData['unit_cost'],
                      'performed_by'   => $user->id,
                  ]);
              }

              return $sale;
          });

          return response()->json(['data' => $sale->only(self::FIELDS)], 201);
      }
  }
  ```

- [ ] **Step 7: Create `backend/app/Http/Controllers/Api/V1/RevertSaleController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\RevertSaleRequest;
  use App\Models\Sale;
  use App\Models\StockMovement;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Support\Facades\DB;

  class RevertSaleController extends Controller
  {
      public function __invoke(RevertSaleRequest $request, Sale $sale): JsonResponse
      {
          $this->authorize('revert', $sale);

          $user = $request->user();

          DB::transaction(function () use ($sale, $user, $request) {
              $sale->update([
                  'is_reverted'  => true,
                  'reverted_by'  => $user->id,
                  'reverted_at'  => now(),
                  'revert_reason' => $request->validated()['reason'],
              ]);

              foreach ($sale->items as $saleItem) {
                  StockMovement::create([
                      'product_id'     => $saleItem->product_id,
                      'location_id'    => $sale->location_id,
                      'movement_type'  => 'sale_revert',
                      'quantity'       => $saleItem->quantity,
                      'reference_type' => 'sale',
                      'reference_id'   => $sale->id,
                      'batch_id'       => $saleItem->batch_id,
                      'unit_cost'      => $saleItem->unit_cost,
                      'performed_by'   => $user->id,
                  ]);
              }
          });

          return response()->json(['data' => $sale->fresh()->only([
              'id', 'is_reverted', 'reverted_by', 'reverted_at', 'revert_reason',
          ])]);
      }
  }
  ```

- [ ] **Step 8: Create `backend/app/Http/Controllers/Api/V1/ClientController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StoreClientRequest;
  use App\Models\Client;
  use Illuminate\Http\JsonResponse;

  class ClientController extends Controller
  {
      private const FIELDS = ['id', 'location_id', 'name', 'phone', 'notes', 'is_active'];

      public function index(): JsonResponse
      {
          $this->authorize('viewAny', Client::class);
          $clients = Client::orderBy('name')->paginate(50);

          return response()->json($clients->through(fn ($c) => $c->only(self::FIELDS)));
      }

      public function store(StoreClientRequest $request): JsonResponse
      {
          $client = Client::create(array_merge(
              $request->validated(),
              ['location_id' => $request->user()->location_id]
          ));

          return response()->json(['data' => $client->only(self::FIELDS)], 201);
      }
  }
  ```

- [ ] **Step 9: Register policies + routes**

  Add to `AppServiceProvider::boot()`:
  ```php
  use App\Models\Client;
  use App\Models\Sale;
  use App\Policies\ClientPolicy;
  use App\Policies\SalePolicy;
  Gate::policy(Sale::class, SalePolicy::class);
  Gate::policy(Client::class, ClientPolicy::class);
  ```

  Add to `routes/api.php` inside `auth:sanctum` group:
  ```php
  use App\Http\Controllers\Api\V1\ClientController;
  use App\Http\Controllers\Api\V1\RevertSaleController;
  use App\Http\Controllers\Api\V1\SaleController;
  Route::apiResource('/clients', ClientController::class)->only(['index', 'store']);
  Route::apiResource('/sales', SaleController::class)->only(['index', 'show', 'store']);
  Route::post('/sales/{sale}/revert', RevertSaleController::class)->name('sales.revert');
  ```

- [ ] **Step 10: Run tests — PASS, full suite, PHPStan, Pint, Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/SalesTest.php
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  ```

  ```bash
  cd ..
  git add backend/app/Models/Client.php backend/app/Models/Sale.php backend/app/Models/SaleItem.php \
          backend/app/Policies/SalePolicy.php backend/app/Policies/ClientPolicy.php \
          backend/app/Http/Requests/Api/V1/StoreSaleRequest.php \
          backend/app/Http/Requests/Api/V1/RevertSaleRequest.php \
          backend/app/Http/Requests/Api/V1/StoreClientRequest.php \
          backend/app/Http/Controllers/Api/V1/SaleController.php \
          backend/app/Http/Controllers/Api/V1/RevertSaleController.php \
          backend/app/Http/Controllers/Api/V1/ClientController.php \
          backend/app/Providers/AppServiceProvider.php \
          backend/routes/api.php backend/tests/Feature/Api/SalesTest.php
  git commit -m "feat(api): POS — sales with auto price tier, clients, admin sale revert"
  ```

---

## Task 5: Reconciliation & User Management API

**Files:**
- Create: `backend/app/Models/Reconciliation.php`
- Create: `backend/app/Policies/ReconciliationPolicy.php`
- Create: `backend/app/Policies/UserManagementPolicy.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreReconciliationRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/StoreUserRequest.php`
- Create: `backend/app/Http/Requests/Api/V1/UpdateUserRequest.php`
- Create: `backend/app/Http/Controllers/Api/V1/ReconciliationController.php`
- Create: `backend/app/Http/Controllers/Api/V1/UserController.php`
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Modify: `backend/routes/api.php`
- Modify: `.superpowers/sdd/progress.md` (mark Phase 4 complete, outline Phase 5)
- Test: `backend/tests/Feature/Api/ReconciliationTest.php`
- Test: `backend/tests/Feature/Api/UserManagementTest.php`

**Interfaces:**
- Consumes: `User`, `Location` from Phase 2 + Tasks 1–4
- Produces: `POST /api/v1/reconciliations` (seller), `GET /api/v1/users` (admin), `POST /api/v1/users` (admin), `PUT /api/v1/users/{user}` (admin)

- [ ] **Step 1: Write failing tests**

  **`backend/tests/Feature/Api/ReconciliationTest.php`:**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  it('seller can submit a daily reconciliation', function () {
      $shopId = DB::table('locations')->insertGetId(['name' => 'RecShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $seller = User::factory()->seller()->create(['location_id' => $shopId]);
      Sanctum::actingAs($seller);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$shopId]), false)");

      try {
          $this->postJson('/api/v1/reconciliations', [
              'reconciliation_date' => today()->toDateString(),
              'total_sold_amount'   => 150000,
          ])
              ->assertCreated()
              ->assertJsonPath('data.total_sold_amount', '150000.00');
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('reconciliation is unique per shop per day', function () {
      $shopId = DB::table('locations')->insertGetId(['name' => 'US'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $seller = User::factory()->seller()->create(['location_id' => $shopId]);
      Sanctum::actingAs($seller);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      DB::statement("SELECT set_config('app.location_ids', json_encode([$shopId]), false)");

      try {
          $this->postJson('/api/v1/reconciliations', ['reconciliation_date' => today()->toDateString(), 'total_sold_amount' => 100]);
          $this->postJson('/api/v1/reconciliations', ['reconciliation_date' => today()->toDateString(), 'total_sold_amount' => 200])
              ->assertStatus(422);
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('store_keeper cannot submit a reconciliation', function () {
      $shopId = DB::table('locations')->insertGetId(['name' => 'RS'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->storeKeeper()->create(['location_id' => $shopId]));

      $this->postJson('/api/v1/reconciliations', ['reconciliation_date' => today()->toDateString(), 'total_sold_amount' => 100])
          ->assertForbidden();
  });
  ```

  **`backend/tests/Feature/Api/UserManagementTest.php`:**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  it('admin can list users', function () {
      User::factory()->count(3)->create();
      Sanctum::actingAs(User::factory()->admin()->create());
      $this->getJson('/api/v1/users')->assertOk()->assertJsonStructure(['data', 'meta']);
  });

  it('admin can create a seller user', function () {
      $shopId = DB::table('locations')->insertGetId(['name' => 'UMShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->admin()->create());

      $this->postJson('/api/v1/users', [
          'name'        => 'Jane Seller',
          'email'       => 'jane.seller.'.uniqid().'@example.com',
          'password'    => 'password123',
          'role'        => 'seller',
          'location_id' => $shopId,
      ])
          ->assertCreated()
          ->assertJsonPath('data.role', 'seller');
  });

  it('non-admin cannot access user management', function () {
      Sanctum::actingAs(User::factory()->storeKeeper()->create());
      $this->getJson('/api/v1/users')->assertForbidden();
  });

  it('admin can toggle user active status', function () {
      $target = User::factory()->seller()->create(['is_active' => true]);
      Sanctum::actingAs(User::factory()->admin()->create());

      $this->putJson("/api/v1/users/{$target->id}", ['is_active' => false])
          ->assertOk()
          ->assertJsonPath('data.is_active', false);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/ReconciliationTest.php tests/Feature/Api/UserManagementTest.php
  ```

- [ ] **Step 3: Create `backend/app/Models/Reconciliation.php`**

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;
  use Illuminate\Database\Eloquent\Relations\BelongsTo;

  class Reconciliation extends Model
  {
      protected $fillable = [
          'location_id', 'seller_id', 'reconciliation_date',
          'total_sold_amount', 'receipt_path', 'notes',
          'verified_by', 'verified_at',
      ];

      protected function casts(): array
      {
          return [
              'reconciliation_date' => 'date',
              'total_sold_amount'   => 'decimal:2',
              'verified_at'         => 'datetime',
          ];
      }

      public function location(): BelongsTo
      {
          return $this->belongsTo(Location::class);
      }

      public function seller(): BelongsTo
      {
          return $this->belongsTo(User::class, 'seller_id');
      }
  }
  ```

- [ ] **Step 4: Create policies**

  **`backend/app/Policies/ReconciliationPolicy.php`:**

  ```php
  <?php

  namespace App\Policies;

  use App\Models\User;

  class ReconciliationPolicy
  {
      public function viewAny(User $user): bool
      {
          return in_array($user->role, ['admin', 'store_keeper', 'seller']);
      }

      public function create(User $user): bool
      {
          return $user->role === 'seller';
      }
  }
  ```

  **`backend/app/Policies/UserManagementPolicy.php`:**

  ```php
  <?php

  namespace App\Policies;

  use App\Models\User;

  class UserManagementPolicy
  {
      public function before(User $user): ?bool
      {
          return $user->role === 'admin' ? true : false;
      }

      public function viewAny(User $user): bool
      {
          return false; // handled by before()
      }

      public function create(User $user): bool
      {
          return false; // handled by before()
      }

      public function update(User $user, User $target): bool
      {
          return false; // handled by before()
      }
  }
  ```

- [ ] **Step 5: Create Form Requests**

  **`backend/app/Http/Requests/Api/V1/StoreReconciliationRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;
  use Illuminate\Validation\Rule;

  class StoreReconciliationRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return $this->user()->role === 'seller';
      }

      public function rules(): array
      {
          $locationId = $this->user()->location_id;

          return [
              'reconciliation_date' => [
                  'required', 'date',
                  Rule::unique('reconciliations')->where(fn ($q) => $q->where('location_id', $locationId)),
              ],
              'total_sold_amount' => ['required', 'numeric', 'min:0'],
              'notes'             => ['nullable', 'string'],
          ];
      }
  }
  ```

  **`backend/app/Http/Requests/Api/V1/StoreUserRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class StoreUserRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return $this->user()->role === 'admin';
      }

      public function rules(): array
      {
          return [
              'name'        => ['required', 'string', 'max:255'],
              'email'       => ['required', 'email', 'unique:users,email'],
              'password'    => ['required', 'string', 'min:8'],
              'role'        => ['required', 'in:admin,store_keeper,seller'],
              'location_id' => ['nullable', 'integer', 'exists:locations,id'],
              'is_active'   => ['nullable', 'boolean'],
          ];
      }
  }
  ```

  **`backend/app/Http/Requests/Api/V1/UpdateUserRequest.php`:**

  ```php
  <?php

  namespace App\Http\Requests\Api\V1;

  use Illuminate\Foundation\Http\FormRequest;

  class UpdateUserRequest extends FormRequest
  {
      public function authorize(): bool
      {
          return $this->user()->role === 'admin';
      }

      public function rules(): array
      {
          $userId = $this->route('user');

          return [
              'name'        => ['sometimes', 'string', 'max:255'],
              'email'       => ['sometimes', 'email', "unique:users,email,{$userId}"],
              'password'    => ['sometimes', 'string', 'min:8'],
              'role'        => ['sometimes', 'in:admin,store_keeper,seller'],
              'location_id' => ['nullable', 'integer', 'exists:locations,id'],
              'is_active'   => ['sometimes', 'boolean'],
          ];
      }
  }
  ```

- [ ] **Step 6: Create controllers**

  **`backend/app/Http/Controllers/Api/V1/ReconciliationController.php`:**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StoreReconciliationRequest;
  use App\Models\Reconciliation;
  use Illuminate\Http\JsonResponse;

  class ReconciliationController extends Controller
  {
      private const FIELDS = ['id', 'location_id', 'seller_id', 'reconciliation_date',
                               'total_sold_amount', 'receipt_path', 'notes',
                               'verified_by', 'verified_at'];

      public function index(): JsonResponse
      {
          $this->authorize('viewAny', Reconciliation::class);
          $recs = Reconciliation::latest()->paginate(50);

          return response()->json($recs->through(fn ($r) => $r->only(self::FIELDS)));
      }

      public function store(StoreReconciliationRequest $request): JsonResponse
      {
          $user = $request->user();
          $rec  = Reconciliation::create(array_merge($request->validated(), [
              'location_id' => $user->location_id,
              'seller_id'   => $user->id,
          ]));

          return response()->json(['data' => $rec->only(self::FIELDS)], 201);
      }
  }
  ```

  **`backend/app/Http/Controllers/Api/V1/UserController.php`:**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Http\Requests\Api\V1\StoreUserRequest;
  use App\Http\Requests\Api\V1\UpdateUserRequest;
  use App\Models\User;
  use Illuminate\Http\JsonResponse;

  class UserController extends Controller
  {
      private const FIELDS = ['id', 'name', 'email', 'role', 'location_id', 'is_active'];

      public function index(): JsonResponse
      {
          $this->authorize('viewAny', User::class);
          $users = User::orderBy('name')->paginate(50);

          return response()->json($users->through(fn ($u) => $u->only(self::FIELDS)));
      }

      public function store(StoreUserRequest $request): JsonResponse
      {
          $user = User::create($request->validated());

          return response()->json(['data' => $user->only(self::FIELDS)], 201);
      }

      public function update(UpdateUserRequest $request, User $user): JsonResponse
      {
          $this->authorize('update', $user);
          $user->update($request->validated());

          return response()->json(['data' => $user->fresh()->only(self::FIELDS)]);
      }
  }
  ```

- [ ] **Step 7: Register policies + routes + update progress ledger**

  Add to `AppServiceProvider::boot()`:
  ```php
  use App\Models\Reconciliation;
  use App\Policies\ReconciliationPolicy;
  use App\Policies\UserManagementPolicy;
  Gate::policy(Reconciliation::class, ReconciliationPolicy::class);
  Gate::policy(User::class, UserManagementPolicy::class);
  ```

  Add to `routes/api.php` inside `auth:sanctum` group:
  ```php
  use App\Http\Controllers\Api\V1\ReconciliationController;
  use App\Http\Controllers\Api\V1\UserController;
  Route::apiResource('/reconciliations', ReconciliationController::class)->only(['index', 'store']);
  Route::apiResource('/users', UserController::class)->only(['index', 'store', 'update']);
  ```

  Update `.superpowers/sdd/progress.md`: mark all Phase 4 tasks complete, outline Phase 5.

- [ ] **Step 8: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/ReconciliationTest.php tests/Feature/Api/UserManagementTest.php
  ```

  Expected: 7 tests passing.

- [ ] **Step 9: Full suite + PHPStan + Pint**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  ```

- [ ] **Step 10: Merge to master and cut Phase 5 branch**

  ```bash
  cd ..
  git add backend/app/Models/Reconciliation.php \
          backend/app/Policies/ReconciliationPolicy.php backend/app/Policies/UserManagementPolicy.php \
          backend/app/Http/Requests/Api/V1/StoreReconciliationRequest.php \
          backend/app/Http/Requests/Api/V1/StoreUserRequest.php backend/app/Http/Requests/Api/V1/UpdateUserRequest.php \
          backend/app/Http/Controllers/Api/V1/ReconciliationController.php \
          backend/app/Http/Controllers/Api/V1/UserController.php \
          backend/app/Providers/AppServiceProvider.php \
          backend/routes/api.php \
          backend/tests/Feature/Api/ReconciliationTest.php backend/tests/Feature/Api/UserManagementTest.php \
          .superpowers/sdd/progress.md
  git commit -m "feat(api): reconciliation, user management — Phase 4 complete"
  git checkout master
  git merge --no-ff feature/phase-4-core-modules \
      -m "feat: complete Phase 4 — core API modules (catalogue, purchasing, distribution, POS, reconciliation)"
  git checkout -b feature/phase-5-supporting-modules
  ```

---

## Self-Review

**Spec coverage:**

| Module | Endpoint(s) | Task |
|---|---|---|
| Product catalogue — CRUD | GET/POST/PUT /products, GET /categories | 1 |
| Pricing — wholesale/retail by qty | `Product::priceTierFor()`, `Product::priceFor()` auto-applied in SaleController | 4 |
| Batch / expiry tracking | GET/POST /products/{id}/batches | 1 |
| Purchasing — stock-in record | POST /purchases (creates purchase_items + stock_movements) | 2 |
| Latest-cost valuation | Trigger fires automatically on purchase_items INSERT | 2 |
| Inventory — stock levels | GET /stock (v_current_stock), /stock/alerts/expiry, /stock/alerts/low | 2 |
| Distribution — create (pending) | POST /distributions (out-movement at store) | 3 |
| Distribution — confirm (seller) | POST /distributions/{id}/confirm (in-movement at shop) | 3 |
| Distribution — discrepancy | `status='discrepancy'` set when received ≠ sent | 3 |
| POS / Selling — auto price tier | `quantity >= wholesale_threshold` in SaleController | 4 |
| POS — payment methods (nmb/airtel/vodacom/tigo) | Form Request `in:` validation | 4 |
| POS — optional client, discount | `client_id`, `discount_amount` nullable fields | 4 |
| Sale stock movement at shop | StockMovement `movement_type=sale, quantity=-qty` | 4 |
| Sale revert — admin only | POST /sales/{id}/revert (restores stock via sale_revert movement) | 4 |
| Clients — shop-level | GET/POST /clients (location_id scoped) | 4 |
| Reconciliation — seller daily | POST /reconciliations (unique/location/date) | 5 |
| User management — admin CRUD | GET/POST /users, PUT /users/{id} | 5 |
| Locations listing | GET /locations | 2 |

**Gaps:** Expenses, news/announcements, attendance, and dashboard/P&L reporting are Phase 5 (supporting modules) per the spec.

**Placeholder scan:** All controller code is complete with actual implementation logic. No "TBD" patterns.

**Type consistency:**
- `Product::priceTierFor(int): string` defined in Task 1, used in SaleController Task 4 — consistent.
- `Product::priceFor(int): string` defined in Task 1, used in SaleController Task 4 — consistent. Returns decimal as string (from Eloquent cast `'decimal:2'`).
- `StockMovement::create([...])` shape consistent across Tasks 2, 3, 4 (all include `product_id`, `location_id`, `movement_type`, `quantity`, `reference_type`, `reference_id`, `unit_cost`, `performed_by`).
- `SaleItem::$timestamps = false` in Task 4 — matches the immutable schema constraint.
- `bcmul`/`bcadd`/`bcsub` used for money arithmetic in SaleController — avoids float precision issues with TZS amounts.
