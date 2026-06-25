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
- [x] Task 5: Auth controllers (Login/Logout/Me) + /api/v1/auth/* routes

## Phase 3: Database schema — migrations, functions, triggers, views, RLS policies

- [ ] Step 3.1: Core tables (locations, products, categories, batches)
- [ ] Step 3.2: Inventory tables (stock_movements ledger, per-location stock)
- [ ] Step 3.3: Sales tables (sales, sale_items, clients)
- [ ] Step 3.4: Supporting tables (expenses, news, attendance, distributions)
- [ ] Step 3.5: PostgreSQL functions + triggers (stock calc, audit)
- [ ] Step 3.6: RLS policies — enable RLS + policies per table using app.* GUCs
- [ ] Step 3.7: Views (current_stock_by_location, low_stock_alerts, etc.)
