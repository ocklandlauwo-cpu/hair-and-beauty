# SDD Progress Ledger

_Started: 2026-06-24_

## Phase 1: Project initialization & tooling — COMPLETE ✓

- [x] Step 1.1: Mono-repo init — commit fdb16e1
- [x] Step 1.env: PHP 8.4 (Laragon) + Node 24 configured
- [x] Task 1: Backend — PostgreSQL & API-only mode (commits fdb16e1..2658437, review clean)
- [x] Task 2: Backend — Tooling (Pest, Pint, PHPStan) + SetDbSessionContext stub (commits 2658437..52cb8eb, review clean)
- [x] Task 3: Frontend — Tailwind v4 design tokens + TS/Vitest config (commits 52cb8eb..722fbf4, review clean)
- [x] Task 4: Frontend — cn(), Axios instance, base types, auth API stubs (commits 722fbf4..2670582, review clean)
- [x] Task 5: Frontend — React Router, QueryClient, AppLayout + placeholders (commits 2670582..32eb1fd, review clean)
- [x] Task 6: frontend/.env.example added; progress ledger updated; merged to master

## Known minor items (non-blocking, track for Phase 2/4)
- backend/config/database.php retains sqlite/mysql/mariadb/sqlsrv + Redis skeleton blocks (inert)
- Pint-formatted backend scaffold files (User.php, providers.php, auth.php, UserFactory.php) — commit with Phase 2 changes
- Sanctum config publication (config/sanctum.php + guard wiring) — Phase 4
- Route auth guards + skip-to-main link — Phase 4 nav implementation

## Phase 2: Backend foundation & DB connections — COMPLETE ✓

- [x] Task 1: PostgreSQL dual-role setup + pgsql_owner connection + migrations.connection
- [x] Task 2: Users migration (role/location_id/is_active) + Sanctum PAT setup + User model
- [x] Task 3: spatie/laravel-permission + RoleSeeder (admin, store_keeper, seller — sanctum guard)
- [x] Task 4: SetDbSessionContext — full set_config() GUC implementation + RESET in finally
- [x] Task 5: Auth controllers (Login/Logout/Me) + /api/v1/auth/* routes (commits 78a0fd2..5ae8b00, final review clean)
  - Fix cherry-picked to master: ceeac70 (@var User annotation in LogoutController + MeController)
  - Track for Phase 3/4: reconcile users.role column ↔ spatie roles duality before any hasRole() is introduced
  - Track for pre-prod: add throttle middleware to POST /login
  - Minor: fix "idempotent-safe" comment in postgresql-roles.sql; document PostgreSQL CI requirement

## Phase 3: Database schema — migrations, functions, triggers, views, RLS policies

- [x] P3 Task 1: locations, categories, users.location_id FK, LocationSeeder, CategorySeeder (commits 5ae8b00..a21a298, review clean)
- [x] P3 Task 2: products (pricing, latest_cost, wholesale_threshold=12), batches (commits a21a298..7b6cf9c, review clean, no findings)
- [x] P3 Task 3: purchases, purchase_items, stock_movements (immutable), fn_get_stock, latest_cost trigger (commits 7b6cf9c..f1e5e2b, review clean)
  - Minor: mixed PHP string quoting in triggers migration (cosmetic)
  - Minor: no index on stock_movements(product_id, location_id) — add in performance pass
  - Note: fn_update_product_latest_cost blind overwrites on batch insert (correct per spec)
- [x] P3 Task 4: distributions, distribution_items, clients, sales, sale_items (immutable) (commits f1e5e2b..72428cf, review clean, no findings)
- [x] P3 Task 5: reconciliations (unique/day), expenses, news, attendance (immutable) (commits 72428cf..a25da3a, review clean after fix)
  - Fix: attendance immutability test wrapped in DB::transaction() for savepoint safety (a25da3a)
- [x] P3 Task 6: v_current_stock, v_expiry_alerts, v_low_stock_alerts views (commits a25da3a..1605b94, review clean)
  - Note: v_low_stock_alerts depends on v_current_stock (CROSS JOIN) — may need materialized view for perf in Phase 4
  - Note: Phase 2 auth+GUC tests fixed for FK enforcement (hardcoded location_id → insertGetId)
  - Minor: LocationSeeder delete() will need CASCADE when child FKs arrive in later tasks
  - Minor: locations.name has no UNIQUE constraint (Category does)
- [x] P3 Task 7: RLS policies on all 16 business tables (commits 1605b94..0e9cbdb, review clean after fix)
  - Fix: added sale_items_delete + attendance_delete admin policies so immutability triggers fire on DELETE (0e9cbdb)
  - Migration: 2026_06_26_095634_enable_rls_and_create_policies.php
  - Test: tests/Feature/Schema/RlsPoliciesTest.php (6/6 pass)
  - Full suite: 51/51 tests pass
  - Key decisions:
    - LOCATION_SCOPED loop handles: clients, sales, reconciliations, expenses, attendance
    - distributions uses to_location_id → explicit policy
    - distribution_items and sale_items use subquery EXISTS join to parent table
    - COALESCE(NULLIF(..., ''), '[]')::jsonb guards against empty app.location_ids on RESET
    - admin UPDATE/DELETE policies added to stock_movements, sale_items, attendance so immutability triggers fire
    - TestCase::setUp() sets app.role=admin GUC; tearDown() resets — no individual test changes needed

## Phase 3: Database schema — COMPLETE ✓

All 7 tasks complete. 51 tests passing. PHPStan clean. Pint formatted.

## Phase 4: Core modules

- [x] P4 Task 1: Catalogue API — categories, products, batches CRUD (commits 2b6d692..e2ad506, review clean after fix)
  - Fix: UpdateProductRequest SKU unique rule uses ->id not object (e2ad506)
  - Minor: ProductController::show() untested; BatchController::index() bypasses policy (both advisory)
  - Note: priceFor() returns float|string (decimal:2 cast) — Task 4 SaleController must handle both
- [x] P4 Task 2: Purchasing & Inventory API — locations, purchases, stock movements, v_current_stock views (commits e2ad506..67aa607, review clean)
  - Fix: SetDbSessionContext finally-block changed to save/restore prior GUC (not RESET) — safe, php-fpm unchanged
  - Fix: fn_update_product_latest_cost() rebuilt as SECURITY DEFINER + local role elevation (RLS prod_update policy blocked store_keeper)
  - Note: Location::where(type=store)->firstOrFail() — single-store assumption, revisit for multi-warehouse
- [x] P4 Task 3: Distribution workflow — create (pending), confirm (in-movement), discrepancy state (commits 67aa607..349e302, review clean after fix)
  - Fix: distribution_items_update RLS missing seller role guard — added (349e302)
  - Fix: fn_update_product_latest_cost SECURITY DEFINER was already in Task 2; confirm uses items()->get() not fresh()
  - Minor: no test for discrepancy status path or double-confirm rejection; ConfirmDistributionController silently defaults missing items to qty_sent
- [x] P4 Task 4: POS / Sales API — sales with auto price-tier, clients, admin sale revert (commit 272dc65, review clean)
  - Fix: revert test needed `set_config('app.role','admin',false)` re-set before admin request (RESET clears GUC, RLS blocked sale_items SELECT)
  - Fix: `Sale::items()` return typed `HasMany<SaleItem, $this>` so PHPStan infers properties on $saleItem loop variable
  - Minor: `SaleController::show()` untested (advisory)
  - Note: seller GUC pattern (set before POST, RESET after) must be replicated in future seller tests
- [x] P4 Task 5: Reconciliation & User Management API — POST /reconciliations (seller-only, unique/location/day), GET/POST /users + PUT /users/{id} (admin-only)
  - Fix: task-5-brief.md used `json_encode([...])` inside SQL string (PHP-in-PostgreSQL syntax error) — corrected to PHP interpolation `'{$locationIdsJson}'` matching SalesTest pattern
  - Fix: `paginate()->through()` doesn't emit `meta` key; UserController::index() uses `toArray()` reshape to return `{data, meta}` structure per test contract
  - Note: UserManagementPolicy::before() returns `false` (not `null`) for non-admins — immediately denies; admins get `true` (bypasses policy methods)
  - Note: P4 Tasks 6 (News + Attendance) and 7 (separate user management task) were subsumed into Task 5 per revised plan
  - Fix: UpdateUserRequest email unique rule uses ->id not object (831e06a) — same bug pattern as Task 1
  - Full suite: 82/82 tests passing (email-update test added). PHPStan clean. Pint formatted.
  - Note: Phase 4 already merged to master (a51e178); UpdateUserRequest fix (831e06a) on phase-5 branch

## Phase 4: Core modules — COMPLETE ✓

All 5 tasks complete. 81 tests passing. PHPStan clean. Pint formatted.

## Phase 5: Supporting modules

- [x] P5 Task 1: News/Announcements API — admin CRUD, published filter for non-admin (commits 831e06a..6621d3f, review clean)
  - Fix: news_write FOR ALL policy missing USING clause — UPDATE/DELETE silently 0-rows; added news_update + news_delete explicit policies
  - Minor: show() returns 403 (not 404) for non-admin on unpublished news
  - Flag: expenses/attendance tables may have same FOR ALL pattern — audit before write endpoints
- [x] P5 Task 2: Expenses API — per-shop, 6 categories, TZS decimal:2, role-scoped location (commits 6621d3f..a48a8a7, review clean)
  - Note: expenses/attendance RLS already has explicit USING clauses — no fix needed (different pattern from news)
- [x] P5 Task 3: Geofenced Attendance API — Haversine clock-in/out, is_within_geofence, seller-scoped list (commits a48a8a7..74f3ca3, review clean)
  - Note: distance_m not persisted (computed on-the-fly); recorded_at can be backdated (design choice)
- [x] P5 Task 4: P&L Report API — GET /reports/pnl (revenue, COGS, gross profit, expenses, net profit, expense_breakdown)
  - Formula: Revenue/COGS from non-reverted sale_items; Net Profit = Gross Profit − Expenses; bcsub() for subtraction
  - Seller auto-scoped to their location_id; admin/store_keeper pass ?location_id= query param
  - 3 tests: admin retrieval, seller scoping, reverted-sale exclusion — all pass
  - Fix: brief test used PostgreSQL's `json_encode(...)` (doesn't exist); corrected to PHP interpolation pattern matching AttendanceTest
  - Full suite: 99/99 tests passing. PHPStan clean. Pint formatted.

## Phase 5: Supporting modules — COMPLETE ✓

All 4 tasks complete. 99 tests passing. PHPStan clean. Pint formatted.
Merged to master: feat: complete Phase 5 — news, expenses, geofenced attendance, P&L report

## Phase 6: Reporting & Dashboards

Planned tasks (branch: feature/phase-6-reporting-dashboards):

- [ ] P6 Task 1: Dashboard summary endpoint — GET /dashboard/summary (stock levels, recent sales, expense totals, low-stock count)
- [ ] P6 Task 2: Sales report — GET /reports/sales (by location, product, date range; aggregated via sale_items)
- [ ] P6 Task 3: Inventory report — GET /reports/inventory (v_current_stock with restock rate, 3-month velocity)
- [ ] P6 Task 4: Restock alerts — GET /stock/alerts/restock (shift-between-shops logic, 3-month restock rate)
- [ ] P6 Task 5: Notifications polling endpoint — GET /notifications (low-stock, expiry, pending distributions)

**Phase 6 scope notes:**
- All endpoints read-only (no new migrations needed beyond Phase 3 views)
- Dashboard aggregates from v_current_stock + sales/expense tables
- Restock alerts deferred from Phase 5 (complex analytics requiring 3-month lookback window)
- Follow same GUC/RLS/policy/form-request pattern established in Phase 4
