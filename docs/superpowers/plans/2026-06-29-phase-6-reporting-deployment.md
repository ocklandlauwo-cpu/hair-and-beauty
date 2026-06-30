# Phase 6: Reporting, Dashboards, Automated Emails & UAT Seed Data

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build role-specific dashboard aggregation endpoints, dompdf PDF reports with automated weekly/monthly email dispatch via the Laravel scheduler, a UAT seed dataset with 3 months of realistic business data, and a data-migration command scaffold for legacy MySQL → PostgreSQL ETL.

**Architecture:** Dashboard API aggregates data from existing tables/views behind the same RLS + GUC middleware used by all other endpoints. PDF generation uses Blade templates + dompdf (already installed). Automated emails use Laravel's database queue driver and scheduler (no Redis/Supervisor) — one cron entry calling `php artisan schedule:run`. UAT seeding and migration are artisan commands runnable once before go-live.

**Tech Stack:** PHP 8.4 / Laravel 12 / dompdf 3.1 / Laravel Mail (SMTP) / Laravel Scheduler / Pest 4

## Global Constraints

- PHP binary: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe`
- All `php artisan` from `backend/` directory
- All Pest: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage`
- All Pint: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint <file>`
- PHPStan: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M`
- PDF engine: `Barryvdh\DomPDF\Facade\Pdf` (package alias `PDF`) — dompdf 3.1 already in composer.json
- Queue driver: `database` (no Redis) — queue jobs sent via `dispatch(...)->onQueue('default')`
- Scheduler: `QUEUE_CONNECTION=database`; single cron entry `* * * * * php /path/to/artisan schedule:run`
- Timezone: EAT (UTC+3) → `APP_TIMEZONE=Africa/Dar_es_Salaam` in `.env`
- Currency: TZS; all money as `decimal(12,2)`; use `number_format()` in Blade for human-readable amounts
- Authorization: `$user->role` directly — NOT `hasRole()`
- Mail: SMTP (DirectAdmin on-premise); `MAIL_MAILER=smtp` in production `.env`
- Report recipients: all `User` records where `role='admin'` and `is_active=true`
- Language: English; no i18n needed

---

## Task 1: Dashboard API — role-specific aggregated data

**Files:**
- Create: `backend/app/Http/Controllers/Api/V1/DashboardController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/DashboardTest.php`

**Interfaces:**
- Consumes: `sales`, `sale_items`, `expenses`, `distributions`, `attendance`, `reconciliations`, `v_expiry_alerts`, `v_low_stock_alerts` tables/views
- Produces: `GET /api/v1/dashboard` → `{data: {role, ...role_specific_keys}}`

**Dashboard data by role:**

*Admin*: `{role, sales: {today, this_month}, expenses: {this_month}, distributions: {pending}, stock: {expiry_alerts, low_stock_alerts}, users: {active}}`

*Store-keeper*: `{role, distributions: {pending, this_week}, purchases: {this_month_count}, stock: {expiry_alerts, low_stock_alerts}}`

*Seller*: `{role, sales_today, sales_count_today, reconciliation_pending (bool), low_stock_count, attendance_today (null | 'clock_in' | 'clock_out')}`

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/DashboardTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Illuminate\Support\Facades\DB;
  use Laravel\Sanctum\Sanctum;

  it('admin dashboard returns required keys', function () {
      Sanctum::actingAs(User::factory()->admin()->create());

      $this->getJson('/api/v1/dashboard')
          ->assertOk()
          ->assertJsonPath('data.role', 'admin')
          ->assertJsonStructure([
              'data' => [
                  'role',
                  'sales'         => ['today', 'this_month'],
                  'expenses'      => ['this_month'],
                  'distributions' => ['pending'],
                  'stock'         => ['expiry_alerts', 'low_stock_alerts'],
                  'users'         => ['active'],
              ],
          ]);
  });

  it('store_keeper dashboard returns required keys', function () {
      $storeId = DB::table('locations')->insertGetId(['name' => 'DStore'.uniqid(), 'type' => 'store', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->storeKeeper()->create(['location_id' => $storeId]));

      $this->getJson('/api/v1/dashboard')
          ->assertOk()
          ->assertJsonPath('data.role', 'store_keeper')
          ->assertJsonStructure([
              'data' => [
                  'role',
                  'distributions' => ['pending', 'this_week'],
                  'purchases'     => ['this_month_count'],
                  'stock'         => ['expiry_alerts', 'low_stock_alerts'],
              ],
          ]);
  });

  it('seller dashboard returns required keys', function () {
      $shopId = DB::table('locations')->insertGetId(['name' => 'DShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs(User::factory()->seller()->create(['location_id' => $shopId]));
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      $locationIdsJson = json_encode([$shopId]);
      DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

      try {
          $this->getJson('/api/v1/dashboard')
              ->assertOk()
              ->assertJsonPath('data.role', 'seller')
              ->assertJsonStructure([
                  'data' => [
                      'role',
                      'sales_today',
                      'sales_count_today',
                      'reconciliation_pending',
                      'low_stock_count',
                      'attendance_today',
                  ],
              ]);
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });

  it('dashboard returns today sales amount correctly', function () {
      $shopId  = DB::table('locations')->insertGetId(['name' => 'DS2'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
      $seller  = User::factory()->seller()->create(['location_id' => $shopId]);
      // Insert a sale for today
      DB::table('sales')->insert(['location_id' => $shopId, 'sold_by' => $seller->id, 'payment_method' => 'nmb', 'total_amount' => 25000, 'discount_amount' => 0, 'sale_date' => today(), 'created_at' => now(), 'updated_at' => now()]);
      Sanctum::actingAs($seller);
      DB::statement("SELECT set_config('app.role', 'seller', false)");
      $locationIdsJson = json_encode([$shopId]);
      DB::statement("SELECT set_config('app.location_ids', '{$locationIdsJson}', false)");

      try {
          $this->getJson('/api/v1/dashboard')
              ->assertOk()
              ->assertJsonPath('data.sales_today', '25000.00')
              ->assertJsonPath('data.sales_count_today', 1);
      } finally {
          DB::unprepared('RESET app.role');
          DB::unprepared('RESET app.location_ids');
      }
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL (route doesn't exist)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/DashboardTest.php
  ```

- [ ] **Step 3: Create `backend/app/Http/Controllers/Api/V1/DashboardController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Http\Request;
  use Illuminate\Support\Facades\DB;

  class DashboardController extends Controller
  {
      public function index(Request $request): JsonResponse
      {
          $user = $request->user();

          return response()->json([
              'data' => match ($user->role) {
                  'admin'        => $this->adminData(),
                  'store_keeper' => $this->storeKeeperData(),
                  'seller'       => $this->sellerData($user),
                  default        => ['role' => $user->role],
              },
          ]);
      }

      private function adminData(): array
      {
          $salesToday     = DB::table('sales')->whereDate('sale_date', today())->where('is_reverted', false)->sum('total_amount');
          $salesMonth     = DB::table('sales')->whereYear('sale_date', now()->year)->whereMonth('sale_date', now()->month)->where('is_reverted', false)->sum('total_amount');
          $expensesMonth  = DB::table('expenses')->whereYear('expense_date', now()->year)->whereMonth('expense_date', now()->month)->sum('amount');
          $pendingDist    = DB::table('distributions')->where('status', 'pending')->count();
          $expiryAlerts   = DB::table('v_expiry_alerts')->count();
          $lowStockAlerts = DB::table('v_low_stock_alerts')->count();
          $activeUsers    = DB::table('users')->where('is_active', true)->count();

          return [
              'role'          => 'admin',
              'sales'         => [
                  'today'      => number_format((float) $salesToday, 2, '.', ''),
                  'this_month' => number_format((float) $salesMonth, 2, '.', ''),
              ],
              'expenses'      => [
                  'this_month' => number_format((float) $expensesMonth, 2, '.', ''),
              ],
              'distributions' => ['pending' => (int) $pendingDist],
              'stock'         => [
                  'expiry_alerts'   => (int) $expiryAlerts,
                  'low_stock_alerts' => (int) $lowStockAlerts,
              ],
              'users'         => ['active' => (int) $activeUsers],
          ];
      }

      private function storeKeeperData(): array
      {
          $pendingDist    = DB::table('distributions')->where('status', 'pending')->count();
          $thisWeekDist   = DB::table('distributions')->whereBetween('distributed_at', [now()->startOfWeek(), now()->endOfWeek()])->count();
          $purchasesMonth = DB::table('purchases')->whereYear('purchase_date', now()->year)->whereMonth('purchase_date', now()->month)->count();
          $expiryAlerts   = DB::table('v_expiry_alerts')->count();
          $lowStockAlerts = DB::table('v_low_stock_alerts')->count();

          return [
              'role'          => 'store_keeper',
              'distributions' => [
                  'pending'   => (int) $pendingDist,
                  'this_week' => (int) $thisWeekDist,
              ],
              'purchases'     => ['this_month_count' => (int) $purchasesMonth],
              'stock'         => [
                  'expiry_alerts'    => (int) $expiryAlerts,
                  'low_stock_alerts' => (int) $lowStockAlerts,
              ],
          ];
      }

      private function sellerData(object $user): array
      {
          $locationId = $user->location_id;

          $salesToday      = DB::table('sales')->where('location_id', $locationId)->whereDate('sale_date', today())->where('is_reverted', false)->sum('total_amount');
          $salesCountToday = DB::table('sales')->where('location_id', $locationId)->whereDate('sale_date', today())->where('is_reverted', false)->count();

          $reconciliationPending = ! DB::table('reconciliations')
              ->where('location_id', $locationId)
              ->where('seller_id', $user->id)
              ->whereDate('reconciliation_date', today())
              ->exists();

          $lowStockCount = DB::table('v_low_stock_alerts')
              ->where('location_id', $locationId)
              ->count();

          $lastAttendance = DB::table('attendance')
              ->where('user_id', $user->id)
              ->whereDate('recorded_at', today())
              ->orderByDesc('recorded_at')
              ->value('action');

          return [
              'role'                  => 'seller',
              'sales_today'           => number_format((float) $salesToday, 2, '.', ''),
              'sales_count_today'     => (int) $salesCountToday,
              'reconciliation_pending' => $reconciliationPending,
              'low_stock_count'       => (int) $lowStockCount,
              'attendance_today'      => $lastAttendance,
          ];
      }
  }
  ```

- [ ] **Step 4: Add route in `backend/routes/api.php`** inside `auth:sanctum` group:

  ```php
  use App\Http\Controllers\Api\V1\DashboardController;
  Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
  ```

- [ ] **Step 5: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/DashboardTest.php
  ```

  Expected: 4 tests passing.

- [ ] **Step 6: Full suite + PHPStan + Pint + Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ routes/
  cd ..
  git add backend/app/Http/Controllers/Api/V1/DashboardController.php \
          backend/routes/api.php backend/tests/Feature/Api/DashboardTest.php
  git commit -m "feat(api): role-specific dashboard aggregation endpoint"
  ```

---

## Task 2: PDF Report Service — Blade templates + dompdf generation

**Files:**
- Create: `backend/resources/views/reports/weekly.blade.php`
- Create: `backend/resources/views/reports/monthly.blade.php`
- Create: `backend/app/Services/ReportService.php`
- Create: `backend/app/Http/Controllers/Api/V1/ReportController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/ReportControllerTest.php`

**Interfaces:**
- Consumes: P&L data from `sale_items`, `sales`, `expenses` tables
- Produces: `ReportService::weekly(string $from, string $to): \Illuminate\Http\Response` (PDF download); `GET /api/v1/reports/weekly` and `GET /api/v1/reports/monthly` — consumed by Task 3 email commands

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Api/ReportControllerTest.php`**

  ```php
  <?php

  use App\Models\User;
  use Laravel\Sanctum\Sanctum;

  it('admin can download weekly report as PDF', function () {
      Sanctum::actingAs(User::factory()->admin()->create());

      $response = $this->get('/api/v1/reports/weekly');

      $response->assertOk()
          ->assertHeader('Content-Type', 'application/pdf');
  });

  it('admin can download monthly report as PDF', function () {
      Sanctum::actingAs(User::factory()->admin()->create());

      $response = $this->get('/api/v1/reports/monthly');

      $response->assertOk()
          ->assertHeader('Content-Type', 'application/pdf');
  });

  it('seller cannot download reports', function () {
      Sanctum::actingAs(User::factory()->seller()->create());

      $this->get('/api/v1/reports/weekly')->assertForbidden();
      $this->get('/api/v1/reports/monthly')->assertForbidden();
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/ReportControllerTest.php
  ```

- [ ] **Step 3: Create `backend/resources/views/reports/weekly.blade.php`**

  ```blade
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <style>
          body  { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #333; }
          h1    { color: #1F3A5F; margin-bottom: 4px; }
          h2    { color: #2E75B6; font-size: 13px; margin: 16px 0 6px; }
          .meta { color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th    { background: #2E75B6; color: #fff; padding: 6px 8px; text-align: left; }
          td    { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
          tr:nth-child(even) td { background: #f9f9f9; }
          .total td { font-weight: bold; background: #eef4fb; border-top: 2px solid #2E75B6; }
          .right { text-align: right; }
          .footer { margin-top: 30px; font-size: 10px; color: #999; text-align: center; }
      </style>
  </head>
  <body>
      <h1>Weekly Sales Report — Hair & Beauty</h1>
      <p class="meta">Period: {{ $from }} to {{ $to }} &nbsp;|&nbsp; Generated: {{ $generatedAt }}</p>

      <h2>Sales Summary by Location</h2>
      <table>
          <thead>
              <tr><th>Location</th><th class="right">Sales Count</th><th class="right">Revenue (TZS)</th><th class="right">COGS (TZS)</th><th class="right">Gross Profit (TZS)</th></tr>
          </thead>
          <tbody>
              @foreach ($salesByLocation as $row)
              <tr>
                  <td>{{ $row->location_name }}</td>
                  <td class="right">{{ number_format($row->sale_count) }}</td>
                  <td class="right">{{ number_format($row->revenue, 0, '.', ',') }}</td>
                  <td class="right">{{ number_format($row->cogs, 0, '.', ',') }}</td>
                  <td class="right">{{ number_format($row->gross_profit, 0, '.', ',') }}</td>
              </tr>
              @endforeach
              <tr class="total">
                  <td>TOTAL</td>
                  <td class="right">{{ number_format($totals['sale_count']) }}</td>
                  <td class="right">{{ number_format($totals['revenue'], 0, '.', ',') }}</td>
                  <td class="right">{{ number_format($totals['cogs'], 0, '.', ',') }}</td>
                  <td class="right">{{ number_format($totals['gross_profit'], 0, '.', ',') }}</td>
              </tr>
          </tbody>
      </table>

      <h2>Expenses by Location</h2>
      <table>
          <thead>
              <tr><th>Location</th><th>Category</th><th class="right">Amount (TZS)</th></tr>
          </thead>
          <tbody>
              @foreach ($expenses as $row)
              <tr>
                  <td>{{ $row->location_name }}</td>
                  <td>{{ ucfirst($row->category) }}</td>
                  <td class="right">{{ number_format($row->total, 0, '.', ',') }}</td>
              </tr>
              @endforeach
              <tr class="total">
                  <td colspan="2">TOTAL EXPENSES</td>
                  <td class="right">{{ number_format($totals['expenses'], 0, '.', ',') }}</td>
              </tr>
          </tbody>
      </table>

      <h2>Net Profit Summary</h2>
      <table>
          <tbody>
              <tr><td>Gross Profit</td><td class="right">{{ number_format($totals['gross_profit'], 0, '.', ',') }} TZS</td></tr>
              <tr><td>Total Expenses</td><td class="right">{{ number_format($totals['expenses'], 0, '.', ',') }} TZS</td></tr>
              <tr class="total"><td>Net Profit</td><td class="right">{{ number_format($totals['net_profit'], 0, '.', ',') }} TZS</td></tr>
          </tbody>
      </table>

      <p class="footer">Hair & Beauty Intelligence Platform &mdash; Confidential</p>
  </body>
  </html>
  ```

- [ ] **Step 4: Create `backend/resources/views/reports/monthly.blade.php`**

  Same structure as weekly but with "Monthly" heading and the period reflecting one calendar month:

  ```blade
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <style>
          body  { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #333; }
          h1    { color: #1F3A5F; margin-bottom: 4px; }
          h2    { color: #2E75B6; font-size: 13px; margin: 16px 0 6px; }
          .meta { color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th    { background: #2E75B6; color: #fff; padding: 6px 8px; text-align: left; }
          td    { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
          tr:nth-child(even) td { background: #f9f9f9; }
          .total td { font-weight: bold; background: #eef4fb; border-top: 2px solid #2E75B6; }
          .right { text-align: right; }
          .footer { margin-top: 30px; font-size: 10px; color: #999; text-align: center; }
      </style>
  </head>
  <body>
      <h1>Monthly P&amp;L Report — Hair & Beauty</h1>
      <p class="meta">Period: {{ $from }} to {{ $to }} &nbsp;|&nbsp; Generated: {{ $generatedAt }}</p>

      <h2>Sales Summary by Location</h2>
      <table>
          <thead>
              <tr><th>Location</th><th class="right">Sales Count</th><th class="right">Revenue (TZS)</th><th class="right">COGS (TZS)</th><th class="right">Gross Profit (TZS)</th></tr>
          </thead>
          <tbody>
              @foreach ($salesByLocation as $row)
              <tr>
                  <td>{{ $row->location_name }}</td>
                  <td class="right">{{ number_format($row->sale_count) }}</td>
                  <td class="right">{{ number_format($row->revenue, 0, '.', ',') }}</td>
                  <td class="right">{{ number_format($row->cogs, 0, '.', ',') }}</td>
                  <td class="right">{{ number_format($row->gross_profit, 0, '.', ',') }}</td>
              </tr>
              @endforeach
              <tr class="total">
                  <td>TOTAL</td>
                  <td class="right">{{ number_format($totals['sale_count']) }}</td>
                  <td class="right">{{ number_format($totals['revenue'], 0, '.', ',') }}</td>
                  <td class="right">{{ number_format($totals['cogs'], 0, '.', ',') }}</td>
                  <td class="right">{{ number_format($totals['gross_profit'], 0, '.', ',') }}</td>
              </tr>
          </tbody>
      </table>

      <h2>Expenses by Category (All Locations)</h2>
      <table>
          <thead>
              <tr><th>Category</th><th class="right">Amount (TZS)</th></tr>
          </thead>
          <tbody>
              @foreach ($expensesByCategory as $row)
              <tr>
                  <td>{{ ucfirst($row->category) }}</td>
                  <td class="right">{{ number_format($row->total, 0, '.', ',') }}</td>
              </tr>
              @endforeach
              <tr class="total">
                  <td>TOTAL EXPENSES</td>
                  <td class="right">{{ number_format($totals['expenses'], 0, '.', ',') }}</td>
              </tr>
          </tbody>
      </table>

      <h2>Monthly P&amp;L</h2>
      <table>
          <tbody>
              <tr><td>Gross Profit</td><td class="right">{{ number_format($totals['gross_profit'], 0, '.', ',') }} TZS</td></tr>
              <tr><td>Total Expenses</td><td class="right">{{ number_format($totals['expenses'], 0, '.', ',') }} TZS</td></tr>
              <tr class="total"><td>Net Profit</td><td class="right">{{ number_format($totals['net_profit'], 0, '.', ',') }} TZS</td></tr>
          </tbody>
      </table>

      <p class="footer">Hair & Beauty Intelligence Platform &mdash; Confidential &mdash; {{ $generatedAt }}</p>
  </body>
  </html>
  ```

- [ ] **Step 5: Create `backend/app/Services/ReportService.php`**

  ```php
  <?php

  namespace App\Services;

  use Barryvdh\DomPDF\Facade\Pdf;
  use Illuminate\Support\Facades\DB;
  use Symfony\Component\HttpFoundation\Response;

  class ReportService
  {
      public function weeklyPdf(string $from, string $to): Response
      {
          $data = $this->gatherData($from, $to, 'weekly');

          return Pdf::loadView('reports.weekly', $data)
              ->setPaper('a4', 'portrait')
              ->download("weekly-report-{$from}-{$to}.pdf");
      }

      public function monthlyPdf(string $from, string $to): Response
      {
          $data = $this->gatherData($from, $to, 'monthly');

          return Pdf::loadView('reports.monthly', $data)
              ->setPaper('a4', 'portrait')
              ->download("monthly-report-{$from}-{$to}.pdf");
      }

      public function gatherData(string $from, string $to, string $type): array
      {
          $salesByLocation = DB::table('sale_items as si')
              ->join('sales as s', 's.id', '=', 'si.sale_id')
              ->join('locations as l', 'l.id', '=', 's.location_id')
              ->where('s.is_reverted', false)
              ->whereBetween('s.sale_date', [$from, $to])
              ->groupBy('l.id', 'l.name')
              ->select(
                  'l.name as location_name',
                  DB::raw('COUNT(DISTINCT s.id) as sale_count'),
                  DB::raw('SUM(si.unit_price * si.quantity) as revenue'),
                  DB::raw('SUM(si.unit_cost * si.quantity) as cogs'),
                  DB::raw('SUM((si.unit_price - si.unit_cost) * si.quantity) as gross_profit')
              )
              ->orderBy('l.name')
              ->get();

          $expenses = DB::table('expenses as e')
              ->join('locations as l', 'l.id', '=', 'e.location_id')
              ->whereBetween('e.expense_date', [$from, $to])
              ->groupBy('l.id', 'l.name', 'e.category')
              ->select('l.name as location_name', 'e.category', DB::raw('SUM(e.amount) as total'))
              ->orderBy('l.name')
              ->orderBy('e.category')
              ->get();

          $expensesByCategory = DB::table('expenses')
              ->whereBetween('expense_date', [$from, $to])
              ->groupBy('category')
              ->select('category', DB::raw('SUM(amount) as total'))
              ->orderBy('category')
              ->get();

          $totalRevenue     = $salesByLocation->sum('revenue');
          $totalCogs        = $salesByLocation->sum('cogs');
          $totalGrossProfit = $totalRevenue - $totalCogs;
          $totalExpenses    = $expenses->sum('total');
          $netProfit        = $totalGrossProfit - $totalExpenses;

          return [
              'from'               => $from,
              'to'                 => $to,
              'generatedAt'        => now()->setTimezone('Africa/Dar_es_Salaam')->format('Y-m-d H:i T'),
              'salesByLocation'    => $salesByLocation,
              'expenses'           => $expenses,
              'expensesByCategory' => $expensesByCategory,
              'totals'             => [
                  'sale_count'   => $salesByLocation->sum('sale_count'),
                  'revenue'      => $totalRevenue,
                  'cogs'         => $totalCogs,
                  'gross_profit' => $totalGrossProfit,
                  'expenses'     => $totalExpenses,
                  'net_profit'   => $netProfit,
              ],
          ];
      }
  }
  ```

- [ ] **Step 6: Create `backend/app/Http/Controllers/Api/V1/ReportController.php`**

  ```php
  <?php

  namespace App\Http\Controllers\Api\V1;

  use App\Http\Controllers\Controller;
  use App\Services\ReportService;
  use Illuminate\Http\Request;
  use Symfony\Component\HttpFoundation\Response;

  class ReportController extends Controller
  {
      public function __construct(private ReportService $reports) {}

      public function weekly(Request $request): Response
      {
          if (! in_array($request->user()->role, ['admin', 'store_keeper'])) {
              abort(403);
          }

          $from = now()->startOfWeek()->toDateString();
          $to   = now()->endOfWeek()->toDateString();

          return $this->reports->weeklyPdf($from, $to);
      }

      public function monthly(Request $request): Response
      {
          if (! in_array($request->user()->role, ['admin', 'store_keeper'])) {
              abort(403);
          }

          $from = now()->startOfMonth()->toDateString();
          $to   = now()->endOfMonth()->toDateString();

          return $this->reports->monthlyPdf($from, $to);
      }
  }
  ```

- [ ] **Step 7: Add routes in `backend/routes/api.php`** inside `auth:sanctum` group:

  ```php
  use App\Http\Controllers\Api\V1\ReportController;
  Route::get('/reports/weekly',  [ReportController::class, 'weekly'])->name('reports.weekly');
  Route::get('/reports/monthly', [ReportController::class, 'monthly'])->name('reports.monthly');
  ```

- [ ] **Step 8: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Api/ReportControllerTest.php
  ```

  Expected: 3 tests passing (`Content-Type: application/pdf` header verified).

- [ ] **Step 9: Full suite + PHPStan + Pint + Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ resources/
  cd ..
  git add backend/resources/views/reports/ backend/app/Services/ReportService.php \
          backend/app/Http/Controllers/Api/V1/ReportController.php \
          backend/routes/api.php backend/tests/Feature/Api/ReportControllerTest.php
  git commit -m "feat(reports): dompdf weekly/monthly PDF generation with Blade templates"
  ```

---

## Task 3: Automated Email Reports — artisan commands + Laravel scheduler + mail config

**Files:**
- Create: `backend/app/Mail/WeeklyReportMail.php`
- Create: `backend/app/Mail/MonthlyReportMail.php`
- Create: `backend/resources/views/mail/report-email.blade.php`
- Create: `backend/app/Console/Commands/SendWeeklyReportCommand.php`
- Create: `backend/app/Console/Commands/SendMonthlyReportCommand.php`
- Modify: `backend/routes/console.php` (scheduler)
- Modify: `backend/bootstrap/app.php` (schedule registration)
- Modify: `backend/.env.example` (SMTP + timezone settings)
- Test: `backend/tests/Feature/Console/SendReportCommandTest.php`

**Interfaces:**
- Consumes: `ReportService::gatherData()` from Task 2, `User::where('role','admin')` list
- Produces: queued mail jobs; `php artisan reports:send-weekly` and `php artisan reports:send-monthly` commands

- [ ] **Step 1: Write failing tests in `backend/tests/Feature/Console/SendReportCommandTest.php`**

  ```php
  <?php

  use App\Mail\MonthlyReportMail;
  use App\Mail\WeeklyReportMail;
  use App\Models\User;
  use Illuminate\Support\Facades\Mail;

  it('send-weekly command dispatches mail to all active admins', function () {
      Mail::fake();

      User::factory()->admin()->create(['email' => 'admin1@test.com', 'is_active' => true]);
      User::factory()->admin()->create(['email' => 'admin2@test.com', 'is_active' => true]);
      User::factory()->admin()->create(['email' => 'inactive@test.com', 'is_active' => false]);

      $this->artisan('reports:send-weekly')->assertSuccessful();

      Mail::assertSent(WeeklyReportMail::class, 2); // only the 2 active admins
  });

  it('send-monthly command dispatches mail to all active admins', function () {
      Mail::fake();

      User::factory()->admin()->create(['email' => 'madmin@test.com', 'is_active' => true]);

      $this->artisan('reports:send-monthly')->assertSuccessful();

      Mail::assertSent(MonthlyReportMail::class, 1);
  });

  it('send-weekly --dry-run does not send mail', function () {
      Mail::fake();
      User::factory()->admin()->create();

      $this->artisan('reports:send-weekly --dry-run')->assertSuccessful();

      Mail::assertNothingSent();
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL (commands don't exist)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Console/SendReportCommandTest.php
  ```

- [ ] **Step 3: Create `backend/resources/views/mail/report-email.blade.php`**

  ```blade
  <!DOCTYPE html>
  <html>
  <body style="font-family: sans-serif; color: #333; font-size: 14px; max-width: 600px; margin: auto;">
      <h2 style="color: #1F3A5F;">{{ $subject }}</h2>
      <p>Dear {{ $adminName }},</p>
      <p>Please find attached the <strong>{{ $reportType }}</strong> for the period <strong>{{ $from }}</strong> to <strong>{{ $to }}</strong>.</p>
      <p>This report includes sales performance, expenses, and net profit across all locations.</p>
      <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">Hair & Beauty Intelligence Platform — Automated Report</p>
  </body>
  </html>
  ```

- [ ] **Step 4: Create `backend/app/Mail/WeeklyReportMail.php`**

  ```php
  <?php

  namespace App\Mail;

  use Illuminate\Bus\Queueable;
  use Illuminate\Mail\Mailable;
  use Illuminate\Mail\Mailables\Attachment;
  use Illuminate\Mail\Mailables\Content;
  use Illuminate\Mail\Mailables\Envelope;
  use Illuminate\Queue\SerializesModels;

  class WeeklyReportMail extends Mailable
  {
      use Queueable, SerializesModels;

      public function __construct(
          public string $adminName,
          public string $from,
          public string $to,
          public string $pdfContent,
          public string $filename,
      ) {}

      public function envelope(): Envelope
      {
          return new Envelope(subject: "Weekly Sales Report ({$this->from} – {$this->to})");
      }

      public function content(): Content
      {
          return new Content(
              view: 'mail.report-email',
              with: [
                  'subject'    => "Weekly Sales Report",
                  'adminName'  => $this->adminName,
                  'reportType' => 'Weekly Sales Report',
                  'from'       => $this->from,
                  'to'         => $this->to,
              ],
          );
      }

      public function attachments(): array
      {
          return [
              Attachment::fromData(fn () => $this->pdfContent, $this->filename)
                  ->withMime('application/pdf'),
          ];
      }
  }
  ```

- [ ] **Step 5: Create `backend/app/Mail/MonthlyReportMail.php`**

  ```php
  <?php

  namespace App\Mail;

  use Illuminate\Bus\Queueable;
  use Illuminate\Mail\Mailable;
  use Illuminate\Mail\Mailables\Attachment;
  use Illuminate\Mail\Mailables\Content;
  use Illuminate\Mail\Mailables\Envelope;
  use Illuminate\Queue\SerializesModels;

  class MonthlyReportMail extends Mailable
  {
      use Queueable, SerializesModels;

      public function __construct(
          public string $adminName,
          public string $from,
          public string $to,
          public string $pdfContent,
          public string $filename,
      ) {}

      public function envelope(): Envelope
      {
          return new Envelope(subject: "Monthly P&L Report ({$this->from} – {$this->to})");
      }

      public function content(): Content
      {
          return new Content(
              view: 'mail.report-email',
              with: [
                  'subject'    => "Monthly P&L Report",
                  'adminName'  => $this->adminName,
                  'reportType' => 'Monthly P&L Report',
                  'from'       => $this->from,
                  'to'         => $this->to,
              ],
          );
      }

      public function attachments(): array
      {
          return [
              Attachment::fromData(fn () => $this->pdfContent, $this->filename)
                  ->withMime('application/pdf'),
          ];
      }
  }
  ```

- [ ] **Step 6: Create `backend/app/Console/Commands/SendWeeklyReportCommand.php`**

  ```php
  <?php

  namespace App\Console\Commands;

  use App\Mail\WeeklyReportMail;
  use App\Models\User;
  use App\Services\ReportService;
  use Barryvdh\DomPDF\Facade\Pdf;
  use Illuminate\Console\Command;
  use Illuminate\Support\Facades\Mail;

  class SendWeeklyReportCommand extends Command
  {
      protected $signature   = 'reports:send-weekly {--dry-run}';
      protected $description = 'Generate and email weekly sales report to all active admins';

      public function __construct(private ReportService $reports)
      {
          parent::__construct();
      }

      public function handle(): int
      {
          $from = now()->startOfWeek()->toDateString();
          $to   = now()->endOfWeek()->toDateString();

          if ($this->option('dry-run')) {
              $this->info("[dry-run] Would send weekly report ({$from}–{$to}) to active admins.");
              return Command::SUCCESS;
          }

          $data     = $this->reports->gatherData($from, $to, 'weekly');
          $pdf      = Pdf::loadView('reports.weekly', $data)->setPaper('a4', 'portrait');
          $content  = $pdf->output();
          $filename = "weekly-report-{$from}-{$to}.pdf";

          $admins = User::where('role', 'admin')->where('is_active', true)->get();

          foreach ($admins as $admin) {
              Mail::to($admin->email)->send(new WeeklyReportMail(
                  adminName:  $admin->name,
                  from:       $from,
                  to:         $to,
                  pdfContent: $content,
                  filename:   $filename,
              ));
          }

          $this->info("Weekly report sent to {$admins->count()} admin(s).");
          return Command::SUCCESS;
      }
  }
  ```

- [ ] **Step 7: Create `backend/app/Console/Commands/SendMonthlyReportCommand.php`**

  ```php
  <?php

  namespace App\Console\Commands;

  use App\Mail\MonthlyReportMail;
  use App\Models\User;
  use App\Services\ReportService;
  use Barryvdh\DomPDF\Facade\Pdf;
  use Illuminate\Console\Command;
  use Illuminate\Support\Facades\Mail;

  class SendMonthlyReportCommand extends Command
  {
      protected $signature   = 'reports:send-monthly {--dry-run}';
      protected $description = 'Generate and email monthly P&L report to all active admins';

      public function __construct(private ReportService $reports)
      {
          parent::__construct();
      }

      public function handle(): int
      {
          $from = now()->startOfMonth()->toDateString();
          $to   = now()->endOfMonth()->toDateString();

          if ($this->option('dry-run')) {
              $this->info("[dry-run] Would send monthly report ({$from}–{$to}) to active admins.");
              return Command::SUCCESS;
          }

          $data     = $this->reports->gatherData($from, $to, 'monthly');
          $pdf      = Pdf::loadView('reports.monthly', $data)->setPaper('a4', 'portrait');
          $content  = $pdf->output();
          $filename = "monthly-report-{$from}-{$to}.pdf";

          $admins = User::where('role', 'admin')->where('is_active', true)->get();

          foreach ($admins as $admin) {
              Mail::to($admin->email)->send(new MonthlyReportMail(
                  adminName:  $admin->name,
                  from:       $from,
                  to:         $to,
                  pdfContent: $content,
                  filename:   $filename,
              ));
          }

          $this->info("Monthly report sent to {$admins->count()} admin(s).");
          return Command::SUCCESS;
      }
  }
  ```

- [ ] **Step 8: Update `backend/routes/console.php`** to register the schedule:

  ```php
  <?php

  use Illuminate\Support\Facades\Schedule;

  // Weekly report: every Monday at 08:00 EAT
  Schedule::command('reports:send-weekly')->weekly()->mondays()->at('08:00');

  // Monthly report: 1st of each month at 08:00 EAT
  Schedule::command('reports:send-monthly')->monthlyOn(1, '08:00');
  ```

- [ ] **Step 9: Update `backend/bootstrap/app.php`** to register schedule via console routes:

  Confirm the existing `withRouting()` call includes `commands:`. If not present, add it. The existing code already has `commands: __DIR__.'/../routes/console.php'` — verify and leave unchanged.

- [ ] **Step 10: Update `backend/.env.example`** — add timezone + SMTP production settings:

  ```dotenv
  APP_TIMEZONE=Africa/Dar_es_Salaam

  MAIL_MAILER=smtp
  MAIL_HOST=mail.hairbeauty.local
  MAIL_PORT=587
  MAIL_USERNAME=reports@hairbeauty.local
  MAIL_PASSWORD=
  MAIL_ENCRYPTION=tls
  MAIL_FROM_ADDRESS="reports@hairbeauty.local"
  MAIL_FROM_NAME="Hair & Beauty Intelligence"
  ```

- [ ] **Step 11: Run tests — expect PASS**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Console/SendReportCommandTest.php
  ```

  Expected: 3 tests passing (mail faked, assertions on `Mail::assertSent()`).

- [ ] **Step 12: Full suite + PHPStan + Pint + Commit**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/ resources/ routes/
  cd ..
  git add backend/app/Mail/ backend/app/Console/Commands/ \
          backend/resources/views/mail/ backend/routes/console.php \
          backend/.env.example backend/tests/Feature/Console/
  git commit -m "feat(scheduler): weekly/monthly PDF report emails via artisan commands + Laravel scheduler"
  ```

---

## Task 4: UAT Seed Data — realistic 3-month dataset

**Files:**
- Create: `backend/database/seeders/UatSeeder.php`
- Create: `backend/database/seeders/UatProductSeeder.php`
- Create: `backend/database/seeders/UatSalesSeeder.php`
- Modify: `backend/database/seeders/DatabaseSeeder.php` (add `--class` conditional)
- Test: `backend/tests/Feature/Seeders/UatSeederTest.php`

**Produces:** `php artisan db:seed --class=UatSeeder` populates: 200 products, 3 shops + 1 store, 5 users, 30 purchases, 60 distributions, ~2000 sale_items across 90 days, 3 months of expenses

- [ ] **Step 1: Write failing test in `backend/tests/Feature/Seeders/UatSeederTest.php`**

  ```php
  <?php

  use Database\Seeders\UatSeeder;

  it('UatSeeder creates required business data', function () {
      $this->seed(UatSeeder::class);

      expect(\Illuminate\Support\Facades\DB::table('products')->count())->toBe(200);
      expect(\Illuminate\Support\Facades\DB::table('users')->where('role', 'seller')->count())->toBe(3);
      expect(\Illuminate\Support\Facades\DB::table('users')->where('role', 'store_keeper')->count())->toBeGreaterThanOrEqual(1);
      expect(\Illuminate\Support\Facades\DB::table('sales')->count())->toBeGreaterThan(50);
      expect(\Illuminate\Support\Facades\DB::table('stock_movements')->count())->toBeGreaterThan(100);
  });
  ```

- [ ] **Step 2: Run test — expect FAIL (UatSeeder doesn't exist)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Seeders/UatSeederTest.php
  ```

- [ ] **Step 3: Create `backend/database/seeders/UatSeeder.php`**

  ```php
  <?php

  namespace Database\Seeders;

  use App\Models\User;
  use Carbon\Carbon;
  use Illuminate\Database\Seeder;
  use Illuminate\Support\Facades\DB;
  use Illuminate\Support\Facades\Hash;

  class UatSeeder extends Seeder
  {
      public function run(): void
      {
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
              'name'     => 'Administrator',
              'password' => Hash::make('admin2026!'),
              'role'     => 'admin',
              'is_active' => true,
          ]);

          $storeKeeper = User::firstOrCreate(['email' => 'storekeeper@hairbeauty.local'], [
              'name'        => 'Store Keeper',
              'password'    => Hash::make('keeper2026!'),
              'role'        => 'store_keeper',
              'location_id' => $storeId,
              'is_active'   => true,
          ]);

          $sellers = [];
          foreach ($shopIds as $i => $shopId) {
              $sellers[$shopId] = User::firstOrCreate(['email' => "seller{$i}@hairbeauty.local"], [
                  'name'        => "Seller {$i}",
                  'password'    => Hash::make('seller2026!'),
                  'role'        => 'seller',
                  'location_id' => $shopId,
                  'is_active'   => true,
              ]);
          }

          // ── Products + Batches ─────────────────────────────────────────────
          $this->call(UatProductSeeder::class);

          // ── Purchases (last 90 days) ───────────────────────────────────────
          $this->call([UatSalesSeeder::class]);
      }
  }
  ```

- [ ] **Step 4: Create `backend/database/seeders/UatProductSeeder.php`**

  ```php
  <?php

  namespace Database\Seeders;

  use Illuminate\Database\Seeder;
  use Illuminate\Support\Facades\DB;

  class UatProductSeeder extends Seeder
  {
      private array $hairProducts = [
          'Shea Butter 250ml', 'Coconut Oil 500ml', 'Argan Oil 100ml', 'Hair Relaxer Kit',
          'Deep Conditioner 400g', 'Leave-In Conditioner 300ml', 'Hair Growth Oil 200ml',
          'Anti-Dandruff Shampoo 400ml', 'Moisturizing Shampoo 400ml', 'Heat Protectant Spray',
          'Hair Gel Strong 250g', 'Hair Wax 150g', 'Edge Control 100g', 'Braiding Gel 500g',
          'Hair Dye Black', 'Hair Dye Brown', 'Hair Dye Blonde', 'Bleaching Powder 500g',
          'Developer 20 Volume', 'Developer 30 Volume',
      ];

      private array $cosmeticsProducts = [
          'Face Cream SPF 30', 'Brightening Serum 30ml', 'Vitamin C Cream 50g',
          'Body Lotion 500ml', 'Whitening Lotion 400ml', 'Hand Cream 100ml',
          'Lip Gloss Pink', 'Lip Gloss Red', 'Lip Gloss Nude',
          'Foundation Light', 'Foundation Medium', 'Foundation Dark',
          'Mascara Black', 'Eyeliner Pencil', 'Eyeshadow Palette',
          'Blush Peach', 'Blush Rose', 'Powder Compact', 'Primer Spray', 'Setting Spray',
      ];

      public function run(): void
      {
          $catHair = DB::table('categories')->where('name', 'Hair')->value('id');
          $catCos  = DB::table('categories')->where('name', 'Cosmetics')->value('id');
          $now     = now();

          // 100 Hair products
          for ($i = 0; $i < 100; $i++) {
              $base     = $this->hairProducts[$i % count($this->hairProducts)];
              $name     = $base.' #'.($i + 1);
              $cost     = rand(2000, 15000);
              $retail   = (int) ($cost * 1.5);
              $wholesale = (int) ($cost * 1.25);
              $prodId   = DB::table('products')->insertGetId([
                  'category_id'         => $catHair,
                  'name'                => $name,
                  'sku'                 => 'HAIR-'.str_pad($i + 1, 4, '0', STR_PAD_LEFT),
                  'unit'                => 'piece',
                  'wholesale_threshold' => 12,
                  'wholesale_price'     => $wholesale,
                  'retail_price'        => $retail,
                  'latest_cost'         => $cost,
                  'is_active'           => true,
                  'created_at'          => $now,
                  'updated_at'          => $now,
              ]);
              // Add batch with staggered expiry dates
              if ($i % 3 === 0) {
                  DB::table('batches')->insert([
                      'product_id'   => $prodId,
                      'batch_number' => 'H'.date('Ym').str_pad($i, 3, '0', STR_PAD_LEFT),
                      'expiry_date'  => now()->addDays(rand(-10, 365))->toDateString(),
                      'created_at'   => $now,
                      'updated_at'   => $now,
                  ]);
              }
          }

          // 100 Cosmetics products
          for ($i = 0; $i < 100; $i++) {
              $base     = $this->cosmeticsProducts[$i % count($this->cosmeticsProducts)];
              $name     = $base.' #'.($i + 1);
              $cost     = rand(3000, 20000);
              $retail   = (int) ($cost * 1.6);
              $wholesale = (int) ($cost * 1.3);
              DB::table('products')->insertGetId([
                  'category_id'         => $catCos,
                  'name'                => $name,
                  'sku'                 => 'COS-'.str_pad($i + 1, 4, '0', STR_PAD_LEFT),
                  'unit'                => 'piece',
                  'wholesale_threshold' => 12,
                  'wholesale_price'     => $wholesale,
                  'retail_price'        => $retail,
                  'latest_cost'         => $cost,
                  'is_active'           => true,
                  'created_at'          => $now,
                  'updated_at'          => $now,
              ]);
          }
      }
  }
  ```

- [ ] **Step 5: Create `backend/database/seeders/UatSalesSeeder.php`**

  ```php
  <?php

  namespace Database\Seeders;

  use Illuminate\Database\Seeder;
  use Illuminate\Support\Facades\DB;

  class UatSalesSeeder extends Seeder
  {
      public function run(): void
      {
          $storeId     = DB::table('locations')->where('type', 'store')->value('id');
          $shopIds     = DB::table('locations')->where('type', 'shop')->pluck('id')->toArray();
          $storeKeeper = DB::table('users')->where('role', 'store_keeper')->value('id');
          $products    = DB::table('products')->select('id', 'retail_price', 'wholesale_price', 'latest_cost')->get();
          $paymentMethods = ['nmb', 'airtel', 'vodacom', 'tigo'];

          // ── Purchases (30 over 90 days, stock at store) ─────────────────
          for ($day = 89; $day >= 0; $day -= 3) {
              $purchaseDate = now()->subDays($day)->toDateString();
              $purchaseId = DB::table('purchases')->insertGetId([
                  'purchased_by'   => $storeKeeper,
                  'supplier_name'  => 'ABC Wholesalers',
                  'purchase_date'  => $purchaseDate,
                  'created_at'     => now()->subDays($day),
                  'updated_at'     => now()->subDays($day),
              ]);

              // 10 random products per purchase
              $sample = $products->random(10);
              foreach ($sample as $product) {
                  $qty  = rand(20, 60);
                  $cost = (int) $product->latest_cost;
                  DB::table('purchase_items')->insert([
                      'purchase_id' => $purchaseId,
                      'product_id'  => $product->id,
                      'quantity'    => $qty,
                      'unit_cost'   => $cost,
                      'created_at'  => now()->subDays($day),
                      'updated_at'  => now()->subDays($day),
                  ]);
                  DB::table('stock_movements')->insert([
                      'product_id'     => $product->id,
                      'location_id'    => $storeId,
                      'movement_type'  => 'purchase',
                      'quantity'       => $qty,
                      'reference_type' => 'purchase',
                      'reference_id'   => $purchaseId,
                      'unit_cost'      => $cost,
                      'performed_by'   => $storeKeeper,
                      'created_at'     => now()->subDays($day),
                  ]);
              }
          }

          // ── Distributions (to each shop every week) ──────────────────────
          foreach ($shopIds as $shopIdx => $shopId) {
              $sellerUser = DB::table('users')->where('role', 'seller')->where('location_id', $shopId)->value('id');
              if (! $sellerUser) {
                  continue;
              }
              for ($week = 12; $week >= 0; $week--) {
                  $distDate   = now()->subWeeks($week)->startOfWeek();
                  $distId     = DB::table('distributions')->insertGetId([
                      'from_location_id' => $storeId,
                      'to_location_id'   => $shopId,
                      'distributed_by'   => $storeKeeper,
                      'confirmed_by'     => $sellerUser,
                      'status'           => 'confirmed',
                      'distributed_at'   => $distDate,
                      'confirmed_at'     => $distDate->copy()->addHours(2),
                      'created_at'       => $distDate,
                      'updated_at'       => $distDate->copy()->addHours(2),
                  ]);

                  $sample = $products->random(8);
                  foreach ($sample as $product) {
                      $qty = rand(10, 30);
                      DB::table('distribution_items')->insert([
                          'distribution_id'  => $distId,
                          'product_id'       => $product->id,
                          'quantity_sent'    => $qty,
                          'quantity_received' => $qty,
                          'created_at'       => $distDate,
                          'updated_at'       => $distDate,
                      ]);
                      // Out from store
                      DB::table('stock_movements')->insert([
                          'product_id'     => $product->id,
                          'location_id'    => $storeId,
                          'movement_type'  => 'distribution_out',
                          'quantity'       => -$qty,
                          'reference_type' => 'distribution',
                          'reference_id'   => $distId,
                          'unit_cost'      => 0,
                          'performed_by'   => $storeKeeper,
                          'created_at'     => $distDate,
                      ]);
                      // In to shop
                      DB::table('stock_movements')->insert([
                          'product_id'     => $product->id,
                          'location_id'    => $shopId,
                          'movement_type'  => 'distribution_in',
                          'quantity'       => $qty,
                          'reference_type' => 'distribution',
                          'reference_id'   => $distId,
                          'unit_cost'      => 0,
                          'performed_by'   => $sellerUser,
                          'created_at'     => $distDate->copy()->addHours(2),
                      ]);
                  }
              }

              // ── Daily sales per shop (last 90 days) ──────────────────────
              for ($day = 89; $day >= 0; $day--) {
                  $saleDate = now()->subDays($day)->toDateString();
                  // 3–8 sales per day per shop
                  $saleCount = rand(3, 8);
                  for ($s = 0; $s < $saleCount; $s++) {
                      $product = $products->random();
                      $qty     = rand(1, 5);
                      $isBulk  = $qty >= 12;
                      $price   = $isBulk ? $product->wholesale_price : $product->retail_price;
                      $total   = $price * $qty;

                      $saleId = DB::table('sales')->insertGetId([
                          'location_id'     => $shopId,
                          'sold_by'         => $sellerUser,
                          'payment_method'  => $paymentMethods[array_rand($paymentMethods)],
                          'total_amount'    => $total,
                          'discount_amount' => 0,
                          'sale_date'       => $saleDate,
                          'created_at'      => now()->subDays($day)->addHours(rand(8, 20)),
                          'updated_at'      => now()->subDays($day)->addHours(rand(8, 20)),
                      ]);

                      DB::table('sale_items')->insert([
                          'sale_id'    => $saleId,
                          'product_id' => $product->id,
                          'quantity'   => $qty,
                          'unit_price' => $price,
                          'unit_cost'  => $product->latest_cost,
                          'price_tier' => $isBulk ? 'wholesale' : 'retail',
                          'created_at' => now()->subDays($day)->addHours(rand(8, 20)),
                      ]);

                      DB::table('stock_movements')->insert([
                          'product_id'     => $product->id,
                          'location_id'    => $shopId,
                          'movement_type'  => 'sale',
                          'quantity'       => -$qty,
                          'reference_type' => 'sale',
                          'reference_id'   => $saleId,
                          'unit_cost'      => $product->latest_cost,
                          'performed_by'   => $sellerUser,
                          'created_at'     => now()->subDays($day)->addHours(rand(8, 20)),
                      ]);
                  }

                  // Monthly expenses (first day of each month)
                  if (now()->subDays($day)->day === 1) {
                      foreach (['rent' => 800000, 'electricity' => 150000, 'security' => 200000] as $cat => $amount) {
                          DB::table('expenses')->insert([
                              'location_id'  => $shopId,
                              'category'     => $cat,
                              'amount'       => $amount + rand(-50000, 50000),
                              'expense_date' => $saleDate,
                              'recorded_by'  => $sellerUser,
                              'created_at'   => now()->subDays($day),
                              'updated_at'   => now()->subDays($day),
                          ]);
                      }
                  }
              }
          }
      }
  }
  ```

- [ ] **Step 6: Run migrations + test**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe artisan migrate --force
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Seeders/UatSeederTest.php
  ```

  Expected: 1 test passing. If it times out: increase PHP `max_execution_time` or run with `pest --timeout=120`.

- [ ] **Step 7: Full suite + PHPStan + Pint + Commit + Merge**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint database/seeders/
  cd ..
  git add backend/database/seeders/UatSeeder.php \
          backend/database/seeders/UatProductSeeder.php \
          backend/database/seeders/UatSalesSeeder.php \
          backend/tests/Feature/Seeders/UatSeederTest.php \
          .superpowers/sdd/progress.md
  git commit -m "feat(uat): seed 200 products, 3-month sales history, distributions, expenses"

  # Merge Phase 6 to master
  git checkout master
  git merge --no-ff feature/phase-6-reporting-dashboards \
      -m "feat: complete Phase 6 — dashboards, PDF reports, scheduler, UAT seed data"
  ```

---

## Self-Review

**Spec coverage:**

| Requirement | Task | Status |
|---|---|---|
| Dashboards & Reports — role-specific | Task 1 (`GET /api/v1/dashboard`) | ✅ |
| Admin dashboard: sales/expenses/distributions/stock | Task 1 adminData() | ✅ |
| Store-keeper dashboard: pending distributions, stock alerts | Task 1 storeKeeperData() | ✅ |
| Seller dashboard: today's sales, reconciliation, attendance | Task 1 sellerData() | ✅ |
| Automated weekly report via SMTP email | Tasks 2 + 3 | ✅ |
| Automated monthly P&L report via SMTP email | Tasks 2 + 3 | ✅ |
| PDF via dompdf | Task 2 (Barryvdh\DomPDF\Facade\Pdf) | ✅ |
| Queue/scheduler via database driver + cron | Task 3 (routes/console.php schedule) | ✅ |
| UAT data (200 products, realistic 3-month history) | Task 4 | ✅ |
| Data migration (legacy MySQL → PostgreSQL) | **Not included** — see note below |

**Data migration gap:** The spec mentions "legacy MySQL → PostgreSQL (one-off ETL)" but without knowing the legacy system schema, only a scaffold command can be built. The UAT Seed Data (Task 4) is prioritized over migration scaffolding since it directly enables UAT. The business should work with the team to define the legacy schema before the migration command is built.

**Frontend integration gap:** The React SPA remains at Phase 1 placeholder state. Wiring the frontend to the API (login, POS UI, dashboard UI, product management) is the largest remaining milestone and should be planned as Phase 7.

**Placeholder scan:** All code blocks are complete and runnable. No "TBD" patterns.

**Type consistency:**
- `DashboardController::sellerData(object $user)` — typed as `object`; PHPStan may require `User` or `\stdClass`. Change to `User $user` if PHPStan complains.
- `ReportService::gatherData()` returns `array` — consumed by both commands and the controller. Consistent.
- `WeeklyReportMail` and `MonthlyReportMail` both have identical constructor signatures — consistent.
- `UatSalesSeeder` uses `$products->random()` — returns a single `stdClass`. Properties `id`, `retail_price`, `wholesale_price`, `latest_cost` must exist — they do, per `UatProductSeeder`'s inserts.
