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
  - Full suite: 81/81 tests passing. PHPStan clean. Pint formatted.

## Phase 4: Core modules — COMPLETE ✓

All 5 tasks complete. 81 tests passing. PHPStan clean. Pint formatted.
Merged to master: feat: complete Phase 4 — core API modules (catalogue, purchasing, distribution, POS, reconciliation, user management)

## Phase 5: Supporting modules

Planned tasks (branch: feature/phase-5-supporting-modules):

- [ ] P5 Task 1: Expenses API — POST /expenses (seller), GET /expenses (admin/store_keeper filter by date/location)
- [ ] P5 Task 2: News & Announcements API — GET /news (all roles), POST /news (admin), mark-read endpoint
- [ ] P5 Task 3: Attendance API — POST /attendance/check-in + /check-out (seller, geofence-validated), GET /attendance (admin)
- [ ] P5 Task 4: Dashboard & Reporting API — GET /dashboard/summary, GET /reports/sales, GET /reports/inventory (P&L view, date-range params)
- [ ] P5 Task 5: Notifications & real-time hooks (optional — push or polling endpoint for low-stock/expiry alerts)

**Phase 5 scope notes:**
- Expenses: location-scoped, immutable (no update/delete per RLS), seller submits daily
- Attendance: geofence check using location.geofence_radius_m + GPS coords; immutable log
- Dashboard: aggregates from v_current_stock + sales/expense tables; no new migrations needed
- All Phase 5 modules follow the same GUC/RLS/policy/form-request pattern established in Phase 4
