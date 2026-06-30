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
- [x] P5 Task 4: P&L Report — GET /reports/pnl, revenue/COGS/gross/expenses/net, seller auto-scoped, reverted-sales excluded (commits 74f3ca3..2b3404e, review clean)
  - Advisory: revenue + COGS are two separate DB queries; could be combined for efficiency
  - Advisory: third test uses DB::table('products')->first() instead of fixture prodId — fragile if isolation degrades
- [x] P5 Task 4: P&L Report API — GET /reports/pnl (revenue, COGS, gross profit, expenses, net profit, expense_breakdown)
  - Formula: Revenue/COGS from non-reverted sale_items; Net Profit = Gross Profit − Expenses; bcsub() for subtraction
  - Seller auto-scoped to their location_id; admin/store_keeper pass ?location_id= query param
  - 3 tests: admin retrieval, seller scoping, reverted-sale exclusion — all pass
  - Fix: brief test used PostgreSQL's `json_encode(...)` (doesn't exist); corrected to PHP interpolation pattern matching AttendanceTest
  - Full suite: 99/99 tests passing. PHPStan clean. Pint formatted.

## Phase 6: Reporting, Dashboards, Email Reports & UAT

- [x] P6 Task 1: Dashboard API — GET /dashboard, 3 role-specific responses (commits 65214c7..9f8f897, review clean)
  - Note: match() replaced with if/elseif/else to satisfy PHPStan; else falls through to sellerData() (safe for 3-role system)
- [x] P6 Task 2: PDF Report Service — Blade templates (weekly/monthly), dompdf A4, GET /reports/weekly|monthly (commits 9f8f897..ee370d9, review clean)
  - Minor: $type param in ReportService::gatherData() accepted but unused — cleanup candidate
- [x] P6 Task 3: Scheduled Email Reports — reports:send-weekly/monthly commands, dry-run, scheduler config, .env.example SMTP (commits ee370d9..25b83ec, review clean)
  - Note: $from/$to renamed to $dateFrom/$dateTo in Mailables (parent Mailable owns those names)
  - Minor: no error handling in commands — exceptions bubble to artisan (acceptable for Phase 6)
- [x] P6 Task 4: UAT Seed Data — 200 products (HAIR/COS), 30 purchases, 13 distributions/shop, 90-day sales, monthly expenses (commits 25b83ec..82d0a75, review clean after fix)
  - Fix: rand(1,5) → rand(1,20) so wholesale tier (~45% of sales) is actually seeded (82d0a75)
  - Advisory: $shopIdx unused in foreach; no DB::transaction() wrapper; updated_at absent from stock_movements (tests pass)
  - Also: fix(middleware) prepend SetDbSessionContext to api group — correct, ensures GUC is set before throttle/other middleware

## Phase 7: Frontend Integration

- [x] P7 Task 1: Auth flow — AuthContext, ProtectedRoute, LoginPage (RHF+Zod v4), role-filtered sidebar, header logout (commits 82d0a75..a53f73a, review clean)
  - Minor: `l.roles.includes(role as never)` smell in Sidebar — replace with `role as Role`
  - Minor: AppLayout.test.tsx updated (needed AuthProvider — correct, not spec deviation)
  - Note: App.tsx orphaned (bypassed by main.tsx) — cleanup debt
- [x] P7 Task 2: Dashboard page + StatCard + Badge + API clients (commits a53f73a..e7e9b29, review clean)
  - Note: vi.mock used instead of enabled:false (TanStack Query v5 — enabled:false yields isLoading:false)
- [x] P7 Task 3: Products list (search/pagination), Stock tabbed view (current/expiry/low), DataTable component (commits e7e9b29..e99810b, review clean)
  - Note: synthetic id field added to StockRow/ExpiryAlert/LowStockAlert (Option B) to satisfy DataTable<T extends {id:number}>
- [x] P7 Task 4: Distributions — list + status badges, create form (product search, qty), confirm receipt (commits e99810b..03cbeb5, review clean)
- [x] P7 Task 5: POS/Sales — sale list, new sale form with auto price-tier, payment methods, discount, running total (commits 03cbeb5..1a40a99, review clean)
- [x] P7 Task 6: Purchasing form (batch/expiry tracking), user management list, merged to master (commits 1a40a99..b5b5999, review clean after fixes)
  - Fix: axios.ts 401 handler now also clears auth_user (stale-auth bug — redirect loop on token expiry)
  - Fix: RoleRoute wrapper added to /users (admin), /purchases+/distributions/new (admin+sk), /sales/new (admin+seller)
  - Deferred to v1.1: role as never→as Role, App.tsx cleanup, aria-label on trash btns, htmlFor on form labels, stock/dashboard invalidation after mutations, NaN guards on number inputs

## Phase 7: Frontend Integration — COMPLETE ✓

All 6 tasks complete. 15 Vitest tests passing. TypeScript clean. Backend: 110 Pest tests passing. SPA wired end-to-end: login, dashboard, products, stock, distributions, POS/sales, purchasing, user management.
- [x] P7 Task 3: Products list (search/pagination), Stock/Inventory view (3 tabs: current/expiry/low), shared DataTable component (12/12 tests pass, tsc clean)
  - Note: DataTable uses Option B (synthetic `id` field on StockRow/ExpiryAlert/LowStockAlert) rather than Option A (keyField prop) — fully working, tsc clean
  - Note: stock.ts adds `id` as alias for product_id/batch_id so DataTable generic `T extends { id: number }` is satisfied
- [x] P7 Task 6: Purchasing form, user management list, routes /purchases /purchases/new /users (15/15 tests pass, tsc clean)

## Phase 7: Frontend Integration — COMPLETE ✓

All 6 tasks complete. 15/15 frontend tests passing. tsc clean. Merged to master.
Merged to master: feat: complete Phase 7 — React SPA wired to API (auth, dashboard, products, stock, distribution, POS, purchasing, users)

## Phase 8: Pre-Launch Hardening

- [x] P8 Task 1: Login throttle (5/min → 429) + stock views WITH security_invoker=true (commits 4478418..8d1e00e, review clean)
- [x] P8 Task 2: Reconciliation page — daily seller form, already-submitted detection, cache invalidation (commits 8d1e00e..ae1a2c9, review clean)
- [x] P8 Task 3: Attendance — clock-in/out with Geolocation API, within/outside geofence display (commits ae1a2c9..b97cc64, review clean)
- [x] P8 Task 4: Expenses form (6 categories, NaN guard) + P&L report (date range, KPI cards) (commits b97cc64..764583a, review clean)
  - Note: PDF download link returns 401 (bearer token not sent by browser anchor) — needs signed URL fix pre-prod
- [x] P8 Task 5: cache invalidation + NaN guards + role as Role + App.tsx removed; merged to master (commits 764583a..e95d68f)
- [x] P8 Final fixes (d8692c6): LoginThrottleTest uses Cache::flush() (not RateLimiter::clear); distribution mutation adds ['stock-expiry'] + ['stock-low']; ViewsTest false positive (TestCase::setUp already sets app.role=admin)

## Phase 8: Pre-Launch Hardening — COMPLETE ✓

Backend: 111/111 Pest tests. Frontend: 18/18 Vitest tests. tsc clean. Merged to master.

**Pre-launch checklist remaining:**
- [ ] PDF download link: implement signed URL or token-param for /reports/monthly and /reports/weekly
- [ ] Production .env: set APP_TIMEZONE=Africa/Dar_es_Salaam, MAIL_MAILER=smtp, all credentials
- [ ] Add OS cron entry: * * * * * php /path/to/artisan schedule:run
- [ ] Data migration: legacy MySQL → PostgreSQL ETL (schema unknown — business to provide)
- [ ] SSL/HTTPS on DirectAdmin VPS
- [ ] Final UAT run with UatSeeder data
- [x] P8 Task 5: UX polish — cache invalidation after mutations (sale/purchase/dist → stock+dashboard stale), NaN guards on discount/qty/cost inputs, `role as Role` TypeScript cleanup, App.tsx orphan deleted (18/18 tests pass, tsc clean)

## Phase 8: Pre-Launch Hardening — COMPLETE ✓

All 5 tasks complete. 18/18 Vitest tests passing. TypeScript clean. Merged to master.

## Phase 9: Go-Live

- [x] P9 Task 1: PDF download via Axios blob — reportsApi + triggerBlobDownload + PnlPage button (commits d8692c6..3dfedcd, review clean)
- [x] P9 Task 2: Deployment config — .env.production.example, ops/deploy.sh, ops/DEPLOYMENT.md (commits 3dfedcd..ebfc9e6, review clean)
- [x] P9 Task 3: migrate:from-mysql scaffold — mysql_legacy connection, --dry-run, 4 entity migrators with CUSTOMISE markers (commits ebfc9e6..a310943, review clean)

## Phase 9: Go-Live — COMPLETE ✓

All 3 tasks complete. 112 Pest tests + 19 Vitest tests. Merged to master.
Full pre-launch checklist: PDF download fixed, deployment runbook written, migration scaffold ready for business to customise column names.
- [x] P9 Task 3: Legacy MySQL migration scaffold — mysql_legacy DB connection, LEGACY_DB_* .env vars, migrate:from-mysql artisan command (--dry-run graceful failure), 1 new test; 112/112 Pest tests passing. PHPStan clean. Pint formatted. Merged to master.

**Screens delivered:**
- Login form (email/password, RHF+Zod)
- Auth state (localStorage, AuthContext, ProtectedRoute)
- Role-based nav sidebar + header logout
- Dashboard — 3 role-specific KPI sets + news feed
- Product list (search, pagination)
- Stock view (3 tabs: current / expiry alerts / low stock)
- Distribution list + status badges, create form, confirm receipt
- Sale list, new sale form (auto price-tier, payment methods, discount)
- Purchase list, record purchase form (product search, batch/expiry per line)
- User management list (admin only)

**Deferred to v1.1 (post-launch):**
- Reconciliation form (POST /reconciliations)
- Attendance clock-in/out UI
- Expenses page
- P&L report UI (charts + date picker)
- Sale revert admin action
- Product create/edit form
- Full news management UI (create/edit/publish)
- App.tsx cleanup (orphaned, bypassed by main.tsx)
- Sidebar: replace `role as never` cast with `role as Role`

## Phase 6: Reporting, Dashboards, Email Reports & UAT — COMPLETE ✓

All 4 tasks complete. 110 tests passing. PHPStan clean. Pint formatted. Merged to master (e45b0f7).

**Operational follow-ups (pre-production, non-blocking for Phase 7):**
1. CRITICAL-PRE-PROD: Recreate v_current_stock, v_low_stock_alerts, v_expiry_alerts WITH (security_invoker=true) — views currently bypass RLS (owner=hairbeauty_owner has BYPASSRLS); seller low_stock_count only correct because of explicit WHERE clause, not RLS
2. Deploy checklist: Add OS cron entry (* * * * * php artisan schedule:run) + set APP_TIMEZONE=Africa/Dar_es_Salaam in production .env — otherwise scheduled reports never fire
3. UAT note: Stock can show negative values for products sold but never distributed — cosmetic, acceptable for demo
- [x] P6 Task 4: UAT Seed Data — UatSeeder, UatProductSeeder, UatSalesSeeder (200 products, 3-month history)
  - Seeds: 200 products (100 hair + 100 cosmetics), 1 admin + 1 store keeper + 3 sellers, 30 purchases, 39 distributions, ~1600 sales, stock movements, monthly expenses
  - Test: 1 new test (6 assertions), full suite 110/110 passing. PHPStan clean. Pint formatted.
  - Runtime: ~5s in test suite (well within budget), ~30–60s for production db:seed

## Phase 6: Reporting & Dashboards — COMPLETE ✓

All 4 tasks complete. 110 tests passing. PHPStan clean. Pint formatted.
Merged to master: feat: complete Phase 6 — dashboards, PDF reports, scheduler, UAT seed data

## Phase 5: Supporting modules — COMPLETE ✓

All 4 tasks complete. 99 tests passing. PHPStan clean. Pint formatted.
Merged to master: feat: complete Phase 5 — news, expenses, geofenced attendance, P&L report
- P10 Task 1: Product create/edit form (ProductFormPage, categoriesApi, productsApi.create/update) — COMPLETE (commits 70a961e..fc8e12c, review clean)
- P10 Task 2: Sale revert action + confirm modal (SalesPage.tsx) — COMPLETE (commits fc8e12c..3d4594c, review clean; minor pre-existing: New Sale Link px-4 vs px-6)
- P10 Task 3: News management page (NewsPage, newsApi CRUD, /news route) — COMPLETE (commits 3d4594c..12843dd, review clean)

## Phase 10: v1.1 Frontend Completions — COMPLETE ✓

All 3 tasks complete. 23 Vitest tests passing. TypeScript clean. Merged to master.
Commits: fc8e12c (product form), 3d4594c (sale revert), 12843dd (news page), e662191 (fixes)

## Phase 11: Reconciliation Verification + Accessibility

- P11 Task 1: Reconciliation verification — POST /reconciliations/:id/verify, VerifyReconciliationController, 3 Pest tests, reconciliationsApi.verify(), Verify button in ReconciliationPage — COMPLETE (commits bc2bcd9..1d9d6ff, review clean; fixes: scoped per-row pending state, onError added)
- P11 Task 2: Accessibility — aria-label on Trash2 buttons (sale/purchase/distribution), htmlFor/id on unlabeled form controls — COMPLETE (commits 1d9d6ff..b1cbb13, review clean)
- Final review fixes: error element outside alreadySubmittedToday conditional, receipt_path in FIELDS, setSuccess(false) in onError (commit 89a525d)

## Phase 11: Reconciliation Verification + Accessibility — COMPLETE ✓

All 2 tasks complete. 115 Pest tests + 23 Vitest tests passing. TypeScript clean. All commits on master.
Commits: 91ed9be (verify endpoint), 1d9d6ff (per-row pending fix), b1cbb13 (a11y), 89a525d (final fixes)
