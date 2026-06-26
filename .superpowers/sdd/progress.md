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
- [x] P3 Task 7: RLS policies on all 16 business tables — COMPLETE ✓
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

## Phase 4: Core modules (upcoming)

- [ ] P4 Task 1: Product CRUD API (admin)
- [ ] P4 Task 2: Stock management API (purchases, stock movements)
- [ ] P4 Task 3: Distribution workflow API
- [ ] P4 Task 4: POS / Sales API (seller)
- [ ] P4 Task 5: Reporting API (reconciliations, views)
- [ ] P4 Task 6: News + Attendance API
- [ ] P4 Task 7: User management API (admin)
