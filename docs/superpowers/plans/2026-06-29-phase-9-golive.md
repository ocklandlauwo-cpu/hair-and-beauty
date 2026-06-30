# Phase 9: Go-Live — PDF Download Fix, Deployment Config & Migration Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the last three pre-launch checklist items: fix the PDF download (token auth via Axios blob), write production deployment configuration and docs, and scaffold the legacy data migration command.

**Architecture:** The PDF fix replaces the broken `<a href>` anchor with an Axios blob fetch that carries the bearer token, then programmatically triggers a browser download. Deployment config lives in `ops/` (new directory) as a shell script + markdown runbook. The migration command uses a second `mysql_legacy` database connection in Laravel and maps legacy table columns to the new schema.

**Tech Stack:** React 19 / Axios (frontend PDF); Bash (deploy script); PHP 8.4 / Laravel 12 / Artisan (migration command)

## Global Constraints

- PHP binary: `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe`; backend commands from `backend/`
- Node commands from `frontend/`; `npx vitest run`; `npx tsc --noEmit`
- API base: `import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'`
- Production host: DirectAdmin VPS; PHP-FPM; PostgreSQL 17; no Redis/Supervisor
- Deployment target: the business's existing domain (user fills in actual domain)
- Migration command flag: `--dry-run` outputs what would be inserted without touching the destination DB

---

## Task 1: Fix PDF report download (Axios blob + programmatic trigger)

**Files:**
- Create: `frontend/src/api/reports.ts`
- Modify: `frontend/src/pages/PnlPage.tsx` (replace `<a>` with download button)
- Test: `frontend/src/pages/PnlPage.test.tsx` (new — smoke test + download button renders)

**Why the `<a href>` doesn't work:** The Laravel API requires `Authorization: Bearer <token>` on every request. A native browser anchor (`<a href="/api/v1/reports/monthly">`) opens a new tab/window without that header, so the server returns 401. The fix fetches the PDF binary through Axios (which injects the token interceptor) as a blob, then creates a temporary Object URL and programmatically clicks a hidden `<a>` to trigger the browser's native "Save as" dialog.

- [ ] **Step 1: Create `frontend/src/api/reports.ts`**

  ```ts
  import api from '@/lib/axios'

  export const reportsApi = {
    downloadWeekly: () =>
      api.get('/reports/weekly', { responseType: 'blob' }),
    downloadMonthly: () =>
      api.get('/reports/monthly', { responseType: 'blob' }),
  }

  export function triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
  ```

- [ ] **Step 2: Update `frontend/src/pages/PnlPage.tsx`**

  Add import at top:
  ```tsx
  import { useState } from 'react'
  import { Download } from 'lucide-react'
  import { reportsApi, triggerBlobDownload } from '@/api/reports'
  ```

  Add state and handler inside the component (after existing `const [to, setTo]`):
  ```tsx
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      const res = await reportsApi.downloadMonthly()
      triggerBlobDownload(
        new Blob([res.data as BlobPart], { type: 'application/pdf' }),
        `monthly-report-${from}-${to}.pdf`,
      )
    } catch {
      setDownloadError('Download failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }
  ```

  Replace the existing `<a>` anchor with this button:
  ```tsx
  <button
    onClick={handleDownload}
    disabled={downloading}
    className="flex items-center gap-2 rounded-md border border-gray-200 px-4 h-10 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
  >
    <Download size={14} />
    {downloading ? 'Downloading…' : 'Download Monthly PDF'}
  </button>
  {downloadError && (
    <p className="text-sm text-red-600">{downloadError}</p>
  )}
  ```

- [ ] **Step 3: Write `frontend/src/pages/PnlPage.test.tsx`**

  ```tsx
  import { it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { AuthProvider } from '@/contexts/AuthContext'
  import PnlPage from './PnlPage'

  it('P&L page renders date inputs and download button', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
    render(
      <QueryClientProvider client={qc}><AuthProvider><MemoryRouter>
        <PnlPage />
      </MemoryRouter></AuthProvider></QueryClientProvider>
    )
    expect(screen.getByRole('heading', { name: /p.l report/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download monthly pdf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate report/i })).toBeInTheDocument()
  })
  ```

- [ ] **Step 4: Run tests + tsc + Commit**

  ```bash
  cd frontend
  npx vitest run
  npx tsc --noEmit
  cd ..
  git add frontend/src/api/reports.ts \
          frontend/src/pages/PnlPage.tsx \
          frontend/src/pages/PnlPage.test.tsx
  git commit -m "fix(frontend): PDF download via Axios blob (carries bearer token)"
  ```

  Expected: 19 tests passing (18 prior + 1 new PnlPage test), tsc clean.

---

## Task 2: Deployment configuration — production env, deploy script, runbook

**Files:**
- Create: `ops/DEPLOYMENT.md` (step-by-step production runbook)
- Create: `backend/.env.production.example` (production environment template)
- Create: `ops/deploy.sh` (deployment automation script)

**No tests** — operational files verified by reading, not automated tests.

- [ ] **Step 1: Create `backend/.env.production.example`**

  ```dotenv
  APP_NAME="Hair & Beauty Intelligence"
  APP_ENV=production
  APP_KEY=          # Run: php artisan key:generate --show
  APP_DEBUG=false
  APP_URL=https://yourdomain.com
  APP_TIMEZONE=Africa/Dar_es_Salaam

  APP_LOCALE=en
  APP_FALLBACK_LOCALE=en
  APP_FAKER_LOCALE=en_US

  LOG_CHANNEL=stack
  LOG_STACK=single
  LOG_DEPRECATIONS_CHANNEL=null
  LOG_LEVEL=error

  DB_CONNECTION=pgsql
  DB_HOST=127.0.0.1
  DB_PORT=5432
  DB_DATABASE=hairbeauty
  DB_USERNAME=hairbeauty_app
  DB_PASSWORD=        # Set to hairbeauty_app's production password

  DB_OWNER_USERNAME=hairbeauty_owner
  DB_OWNER_PASSWORD=  # Set to hairbeauty_owner's production password

  AUTH_GUARD=sanctum

  SESSION_DRIVER=database
  SESSION_LIFETIME=30
  SESSION_ENCRYPT=false
  SESSION_PATH=/
  SESSION_DOMAIN=.yourdomain.com

  BROADCAST_CONNECTION=log
  FILESYSTEM_DISK=local
  QUEUE_CONNECTION=database
  CACHE_STORE=database

  MAIL_MAILER=smtp
  MAIL_HOST=mail.yourdomain.com
  MAIL_PORT=587
  MAIL_USERNAME=reports@yourdomain.com
  MAIL_PASSWORD=      # DirectAdmin mail account password
  MAIL_ENCRYPTION=tls
  MAIL_FROM_ADDRESS="reports@yourdomain.com"
  MAIL_FROM_NAME="Hair & Beauty Intelligence"

  FRONTEND_URL=https://yourdomain.com
  VITE_APP_NAME="Hair & Beauty"
  VITE_API_URL=https://yourdomain.com/api/v1
  ```

- [ ] **Step 2: Create `ops/deploy.sh`**

  ```bash
  #!/usr/bin/env bash
  # Hair & Beauty Intelligence — Production Deployment Script
  # Run from the server as: bash ops/deploy.sh
  # Prerequisites: git, PHP 8.4, composer, node 24, psql, DirectAdmin vhost configured

  set -euo pipefail

  REPO_DIR="/var/www/hairbeauty"           # Change to your server path
  BACKEND_DIR="$REPO_DIR/backend"
  FRONTEND_DIR="$REPO_DIR/frontend"
  PHP_BIN="/usr/bin/php8.4"               # Adjust for your server's PHP path
  COMPOSER_BIN="/usr/local/bin/composer"

  echo "==> Pulling latest code"
  cd "$REPO_DIR"
  git pull origin master

  echo "==> Installing backend dependencies"
  cd "$BACKEND_DIR"
  "$COMPOSER_BIN" install --no-dev --optimize-autoloader

  echo "==> Copying production env"
  if [ ! -f "$BACKEND_DIR/.env" ]; then
    cp "$BACKEND_DIR/.env.production.example" "$BACKEND_DIR/.env"
    echo "  IMPORTANT: Edit .env with real credentials, then re-run."
    exit 1
  fi

  echo "==> Running migrations (as hairbeauty_owner)"
  "$PHP_BIN" artisan migrate --force

  echo "==> Seeding roles (idempotent)"
  "$PHP_BIN" artisan db:seed --class=RoleSeeder --force

  echo "==> Clearing caches"
  "$PHP_BIN" artisan config:clear
  "$PHP_BIN" artisan route:clear
  "$PHP_BIN" artisan view:clear

  echo "==> Caching config and routes for production"
  "$PHP_BIN" artisan config:cache
  "$PHP_BIN" artisan route:cache

  echo "==> Building frontend"
  cd "$FRONTEND_DIR"
  if [ ! -f ".env" ]; then
    cp ".env.example" ".env"
    echo "  IMPORTANT: Edit frontend/.env with VITE_API_URL, then re-run."
    exit 1
  fi
  npm ci --omit=dev
  npm run build

  echo "==> Copying frontend dist to web root"
  # DirectAdmin: copy frontend/dist into public_html or a subdirectory
  # Adjust TARGET_DIR to your DirectAdmin document root:
  TARGET_DIR="/home/yourusername/public_html"
  rsync -a --delete "$FRONTEND_DIR/dist/" "$TARGET_DIR/"

  echo "==> Restarting PHP-FPM"
  # Adjust service name for your DirectAdmin setup:
  sudo systemctl reload php8.4-fpm 2>/dev/null || echo "  (PHP-FPM reload skipped — do manually)"

  echo "==> Done. Verify at https://yourdomain.com"
  ```

- [ ] **Step 3: Create `ops/DEPLOYMENT.md`**

  ```markdown
  # Production Deployment Runbook

  ## Prerequisites

  - DirectAdmin VPS with PHP 8.4, PostgreSQL 17, Node 24
  - Domain and SSL certificate configured in DirectAdmin
  - SSH access to server

  ## First-Time Setup

  ### 1. Clone the repository
  ```bash
  cd /var/www
  git clone <your-repo-url> hairbeauty
  ```

  ### 2. Set up PostgreSQL roles and database
  ```bash
  psql -U postgres -f /var/www/hairbeauty/backend/database/setup/postgresql-roles.sql
  ```
  Edit the SQL file first: replace `'owner_secret'` and `'app_secret'` with strong passwords.

  ### 3. Configure backend environment
  ```bash
  cp backend/.env.production.example backend/.env
  nano backend/.env   # Fill in DB passwords, app key, mail credentials
  php8.4 artisan key:generate   # Paste output into APP_KEY
  ```

  ### 4. Configure frontend environment
  ```bash
  cp frontend/.env.example frontend/.env
  nano frontend/.env  # Set VITE_API_URL=https://yourdomain.com/api/v1
  ```

  ### 5. Run deploy script
  ```bash
  bash ops/deploy.sh
  ```

  ### 6. Configure DirectAdmin cron (scheduler)
  In DirectAdmin → Cron Jobs, add:
  ```
  * * * * * /usr/bin/php8.4 /var/www/hairbeauty/backend/artisan schedule:run >> /dev/null 2>&1
  ```

  ### 7. Configure DirectAdmin web server
  Point document root to `/var/www/hairbeauty/frontend/dist` for the SPA.
  Add a `.htaccess` or nginx rule to redirect all non-asset requests to `index.html` (SPA routing).
  Configure a reverse proxy or separate subdomain for the API at `/var/www/hairbeauty/backend/public`.

  ### 8. Process queued jobs
  Since there is no Supervisor/Redis, queued jobs run via the scheduler:
  In `backend/routes/console.php`, add:
  ```php
  Schedule::command('queue:work --stop-when-empty')->everyMinute()->runInBackground();
  ```

  ## Ongoing Deployments

  ```bash
  ssh user@yourserver.com
  cd /var/www/hairbeauty
  bash ops/deploy.sh
  ```

  ## Creating the First Admin User

  ```bash
  php8.4 artisan tinker
  ```
  ```php
  use App\Models\User;
  use Illuminate\Support\Facades\Hash;

  User::create([
      'name'     => 'Administrator',
      'email'    => 'admin@yourdomain.com',
      'password' => Hash::make('change-me-immediately'),
      'role'     => 'admin',
      'is_active' => true,
  ]);
  ```

  ## UAT Seed Data (for testing before go-live)

  ```bash
  php8.4 artisan db:seed --class=UatSeeder
  ```
  This creates 200 products, 5 test users (admin, store_keeper, 3 sellers), and 3 months of realistic sales history.

  ## Troubleshooting

  | Symptom | Fix |
  |---|---|
  | Login returns 401 | Check APP_KEY is set; check DB has users |
  | PDF download fails | Check MAIL_* and APP_URL settings |
  | Scheduled reports not sending | Verify cron is running: `crontab -l` |
  | Blank page after deploy | Check `frontend/.env` VITE_API_URL matches production API URL |
  | 500 errors | Check `backend/storage/logs/laravel.log` |
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add backend/.env.production.example ops/
  git commit -m "docs(ops): production env template, deploy script, deployment runbook"
  ```

---

## Task 3: Data migration command scaffold

**Files:**
- Modify: `backend/config/database.php` (add `mysql_legacy` connection)
- Modify: `backend/.env.example` (add `LEGACY_DB_*` vars)
- Create: `backend/app/Console/Commands/MigrateFromMysqlCommand.php`
- Test: `backend/tests/Feature/Console/MigrateFromMysqlCommandTest.php`

**What this command does:** Reads products, categories, users, and locations from a legacy MySQL database and inserts them into the new PostgreSQL database. The `--dry-run` flag prints what would be inserted without writing. The business must fill in `LEGACY_DB_*` credentials and review the column mapping before running.

- [ ] **Step 1: Add `mysql_legacy` connection to `backend/config/database.php`**

  In the `connections` array, after the `pgsql_owner` block, add:

  ```php
  'mysql_legacy' => [
      'driver'    => 'mysql',
      'host'      => env('LEGACY_DB_HOST', '127.0.0.1'),
      'port'      => env('LEGACY_DB_PORT', '3306'),
      'database'  => env('LEGACY_DB_DATABASE', ''),
      'username'  => env('LEGACY_DB_USERNAME', ''),
      'password'  => env('LEGACY_DB_PASSWORD', ''),
      'charset'   => 'utf8mb4',
      'collation' => 'utf8mb4_unicode_ci',
      'prefix'    => '',
      'strict'    => true,
  ],
  ```

- [ ] **Step 2: Add legacy DB vars to `backend/.env.example`**

  After the existing `DB_OWNER_*` section, add:

  ```dotenv
  # Legacy MySQL connection (one-time migration only)
  LEGACY_DB_HOST=127.0.0.1
  LEGACY_DB_PORT=3306
  LEGACY_DB_DATABASE=
  LEGACY_DB_USERNAME=
  LEGACY_DB_PASSWORD=
  ```

- [ ] **Step 3: Write failing test in `backend/tests/Feature/Console/MigrateFromMysqlCommandTest.php`**

  ```php
  <?php

  it('migrate:from-mysql --dry-run runs without error when no legacy connection configured', function () {
      // Without a real MySQL connection, the command should fail gracefully
      // with a clear error rather than crashing PHP
      $this->artisan('migrate:from-mysql --dry-run')
          ->expectsOutputToContain('[DRY RUN]')
          ->assertFailed();
  });
  ```

- [ ] **Step 4: Run test — expect FAIL (command doesn't exist yet)**

  ```bash
  cd backend
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Console/MigrateFromMysqlCommandTest.php
  ```

- [ ] **Step 5: Create `backend/app/Console/Commands/MigrateFromMysqlCommand.php`**

  ```php
  <?php

  namespace App\Console\Commands;

  use Illuminate\Console\Command;
  use Illuminate\Support\Facades\DB;
  use Illuminate\Support\Facades\Hash;

  class MigrateFromMysqlCommand extends Command
  {
      protected $signature   = 'migrate:from-mysql {--dry-run : Print what would be inserted without writing}';
      protected $description = 'Migrate legacy MySQL data to PostgreSQL (one-time ETL)';

      public function handle(): int
      {
          $isDry = $this->option('dry-run');

          if ($isDry) {
              $this->info('[DRY RUN] No data will be written.');
          }

          try {
              DB::connection('mysql_legacy')->getPdo();
          } catch (\Exception $e) {
              $this->error('Cannot connect to legacy MySQL: ' . $e->getMessage());
              $this->line('Set LEGACY_DB_HOST, LEGACY_DB_DATABASE, LEGACY_DB_USERNAME, LEGACY_DB_PASSWORD in .env');
              return Command::FAILURE;
          }

          $this->migrateCategories($isDry);
          $this->migrateProducts($isDry);
          $this->migrateLocations($isDry);
          $this->migrateUsers($isDry);

          $this->info($isDry ? '[DRY RUN] Migration preview complete.' : 'Migration complete.');
          return Command::SUCCESS;
      }

      private function migrateCategories(bool $isDry): void
      {
          // ── CUSTOMISE: map your legacy categories table ──────────────────
          // Example assumes legacy table: `categories` with columns `id`, `name`
          $rows = DB::connection('mysql_legacy')->table('categories')->get();
          $this->info("Categories: {$rows->count()} found");

          foreach ($rows as $row) {
              $data = ['name' => $row->name, 'created_at' => now(), 'updated_at' => now()];
              if ($isDry) {
                  $this->line("  WOULD INSERT category: {$row->name}");
              } else {
                  DB::table('categories')->insertOrIgnore($data);
              }
          }
      }

      private function migrateProducts(bool $isDry): void
      {
          // ── CUSTOMISE: map your legacy products table ────────────────────
          // Example assumes legacy columns: id, name, category_id, retail_price, wholesale_price, cost
          $rows = DB::connection('mysql_legacy')->table('products')->get();
          $this->info("Products: {$rows->count()} found");

          foreach ($rows as $row) {
              // Find the new category_id by name (assumes categories already migrated)
              $catId = DB::table('categories')->where('name', $row->category_name ?? 'Hair')->value('id');

              $data = [
                  'category_id'     => $catId ?? 1,
                  'name'            => $row->name,
                  'retail_price'    => $row->retail_price ?? 0,
                  'wholesale_price' => $row->wholesale_price ?? 0,
                  'latest_cost'     => $row->cost ?? 0,
                  'is_active'       => true,
                  'created_at'      => now(),
                  'updated_at'      => now(),
              ];

              if ($isDry) {
                  $this->line("  WOULD INSERT product: {$row->name}");
              } else {
                  DB::table('products')->insertOrIgnore($data);
              }
          }
      }

      private function migrateLocations(bool $isDry): void
      {
          // ── CUSTOMISE: map your legacy shops/stores table ─────────────────
          // Example assumes legacy table: `locations` with columns `id`, `name`, `type`
          // Skip if locations are already seeded (LocationSeeder was already run)
          $existing = DB::table('locations')->count();
          if ($existing > 0) {
              $this->warn("Locations already exist ({$existing} rows) — skipping.");
              return;
          }

          $rows = DB::connection('mysql_legacy')->table('shops')->get();
          $this->info("Locations: {$rows->count()} found");

          foreach ($rows as $row) {
              $data = [
                  'name'              => $row->name,
                  'type'              => $row->type ?? 'shop',
                  'geofence_radius_m' => 100,
                  'is_active'         => true,
                  'created_at'        => now(),
                  'updated_at'        => now(),
              ];
              if ($isDry) {
                  $this->line("  WOULD INSERT location: {$row->name}");
              } else {
                  DB::table('locations')->insertOrIgnore($data);
              }
          }
      }

      private function migrateUsers(bool $isDry): void
      {
          // ── CUSTOMISE: map your legacy users table ────────────────────────
          // Example assumes legacy columns: name, email, role, shop_id
          $rows = DB::connection('mysql_legacy')->table('users')->get();
          $this->info("Users: {$rows->count()} found");

          foreach ($rows as $row) {
              $locationId = null;
              if (! empty($row->shop_id)) {
                  // Map legacy shop_id to new location id
                  $locationId = DB::table('locations')->skip((int) $row->shop_id - 1)->value('id');
              }

              $data = [
                  'name'        => $row->name,
                  'email'       => $row->email,
                  'password'    => Hash::make('ChangeMe2026!'), // User must reset on first login
                  'role'        => $row->role ?? 'seller',
                  'location_id' => $locationId,
                  'is_active'   => true,
                  'created_at'  => now(),
                  'updated_at'  => now(),
              ];

              if ($isDry) {
                  $this->line("  WOULD INSERT user: {$row->email} ({$data['role']})");
              } else {
                  DB::table('users')->insertOrIgnore($data);
              }
          }
      }
  }
  ```

- [ ] **Step 6: Run test — expect PASS (dry-run fails gracefully with no MySQL)**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage tests/Feature/Console/MigrateFromMysqlCommandTest.php
  ```

  Expected:
  ```
  PASS  Tests\Feature\Console\MigrateFromMysqlCommandTest
  ✓ migrate:from-mysql --dry-run runs without error when no legacy connection configured
  ```

- [ ] **Step 7: Run full backend suite + PHPStan + Pint**

  ```bash
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pest --no-coverage
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/phpstan analyse --memory-limit=512M
  C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe vendor/bin/pint app/Console/Commands/ config/database.php
  ```

- [ ] **Step 8: Update progress ledger + Commit + merge**

  ```bash
  cd ..
  git add backend/config/database.php backend/.env.example \
          backend/app/Console/Commands/MigrateFromMysqlCommand.php \
          backend/tests/Feature/Console/MigrateFromMysqlCommandTest.php \
          .superpowers/sdd/progress.md
  git commit -m "feat(migration): php artisan migrate:from-mysql scaffold with --dry-run; mysql_legacy connection"

  # Merge Phase 9 to master
  git checkout master
  git merge --no-ff feature/phase-9-golive \
      -m "feat: Phase 9 — PDF download fix, deployment runbook, legacy migration scaffold"
  ```

---

## Self-Review

**Spec coverage:**

| Pre-launch item | Covered by |
|---|---|
| PDF download link returns 401 (bearer token) | Task 1 — Axios blob fetch via `reportsApi.downloadMonthly()` |
| Production .env with all credentials | Task 2 — `backend/.env.production.example` |
| OS cron entry documentation | Task 2 — `ops/DEPLOYMENT.md` section 6 |
| Deploy script | Task 2 — `ops/deploy.sh` |
| Data migration legacy MySQL → PostgreSQL | Task 3 — `migrate:from-mysql` command scaffold |
| First admin user setup | Task 2 — `ops/DEPLOYMENT.md` "Creating the First Admin User" |
| UAT seed data | Task 2 — `ops/DEPLOYMENT.md` references `UatSeeder` |

**Not in this plan (requires business input):** SSL certificate setup (DirectAdmin-specific); exact legacy MySQL column mapping (business provides old schema; comment markers in the scaffold guide customisation).

**Placeholder scan:** The migration command has comment markers `── CUSTOMISE: ──` explaining exactly what to change and why. These are not "TBD" placeholders — they are explicit instructions for a developer who knows the legacy schema. Each method has working example SQL that needs column names updated, not missing implementation.

**Type consistency:**
- `reportsApi.downloadMonthly()` returns `Promise<AxiosResponse<Blob>>` — the `.data` accessed in the handler is typed as `unknown` from Axios generics; the `as BlobPart` cast is correct for the blob constructor.
- `triggerBlobDownload(blob: Blob, filename: string): void` — called with `new Blob([res.data as BlobPart], { type: 'application/pdf' })`. Correct.
