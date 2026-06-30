# Phase 1 Completion: Backend Foundation & Frontend Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 1 scaffolding so the project has a working API-only Laravel backend (PostgreSQL, Sanctum bearer tokens, CORS) and a structured React frontend (Tailwind v4 design tokens, React Router, TanStack Query, Axios) — both ready for feature development in Phase 2+.

**Architecture:** Backend is a pure REST API under `/api/v1` with no web views; it uses Sanctum bearer token auth and PostgreSQL. Frontend is a React 19 SPA consuming that API, structured with feature-oriented folders under `src/`, Tailwind v4 CSS-first config, and React Router v7.

**Tech Stack:** PHP 8.4 / Laravel 12 / Sanctum 4.3 / PostgreSQL 17 / Pest 4 / Pint / Larastan; React 19 / TypeScript 5.9 / Vite 7 / Tailwind CSS v4 / React Router DOM 7 / TanStack Query 5 / Axios 1 / Vitest 4

## Global Constraints

- DB: PostgreSQL 17 only — no SQLite, no MySQL
- Two DB roles: `hairbeauty_owner` (migrations) + `hairbeauty_app` (web requests) — set up in Phase 2, referenced here
- Auth: Sanctum bearer tokens — no cookie-based SPA auth; `supports_credentials` is false in CORS
- No Redis, no Supervisor — queue driver: `database`; cache/session driver: `database`/`file`
- Frontend URL: `http://localhost:5173` (Vite dev) for CORS `allowed_origins`
- Design: light mode only; brand blue `#2E75B6` (primary-600); sidebar navy `#1F3A5F` (primary-900); body 14px; control height 40px; `lucide-react` icons
- Currency: TZS; Timezone: EAT (UTC+3); Language: English
- Session timeout: 30 minutes (SESSION_LIFETIME=30 in backend .env)

---

## Task 1: Backend — PostgreSQL & API-only mode

**Files:**
- Modify: `backend/config/database.php` (change default from sqlite to pgsql)
- Modify: `backend/.env.example` (PostgreSQL connection settings + SESSION_LIFETIME=30)
- Modify: `backend/.env` (local PostgreSQL credentials — same keys as .env.example)
- Modify: `backend/bootstrap/app.php` (API routes, remove web, JSON exceptions)
- Create: `backend/routes/api.php` (v1 prefix with `/ping` health route)
- Create: `backend/config/cors.php` (allow localhost:5173, bearer token settings)
- Create: `backend/tests/Feature/HealthCheckTest.php` (Pest test for /up and /api/v1/ping)

**Interfaces:**
- Produces: `GET /up` → 200, `GET /api/v1/ping` → `{"status":"ok"}` — consumed by Task 2's Pest run

- [ ] **Step 1: Update `backend/config/database.php` — change default to pgsql**

  Change line 19 only:
  ```php
  'default' => env('DB_CONNECTION', 'pgsql'),
  ```

- [ ] **Step 2: Rewrite `backend/.env.example` — PostgreSQL settings**

  Replace the DB and SESSION sections:
  ```dotenv
  APP_NAME="Hair & Beauty"
  APP_ENV=local
  APP_KEY=
  APP_DEBUG=true
  APP_URL=http://localhost:8000

  APP_LOCALE=en
  APP_FALLBACK_LOCALE=en
  APP_FAKER_LOCALE=en_US

  APP_MAINTENANCE_DRIVER=file

  PHP_CLI_SERVER_WORKERS=4

  BCRYPT_ROUNDS=12

  LOG_CHANNEL=stack
  LOG_STACK=single
  LOG_DEPRECATIONS_CHANNEL=null
  LOG_LEVEL=debug

  DB_CONNECTION=pgsql
  DB_HOST=127.0.0.1
  DB_PORT=5432
  DB_DATABASE=hairbeauty
  DB_USERNAME=hairbeauty_owner
  DB_PASSWORD=

  SESSION_DRIVER=database
  SESSION_LIFETIME=30
  SESSION_ENCRYPT=false
  SESSION_PATH=/
  SESSION_DOMAIN=null

  BROADCAST_CONNECTION=log
  FILESYSTEM_DISK=local
  QUEUE_CONNECTION=database

  CACHE_STORE=database

  MAIL_MAILER=log
  MAIL_HOST=127.0.0.1
  MAIL_PORT=2525
  MAIL_USERNAME=null
  MAIL_PASSWORD=null
  MAIL_FROM_ADDRESS="noreply@hairbeauty.local"
  MAIL_FROM_NAME="${APP_NAME}"

  FRONTEND_URL=http://localhost:5173

  VITE_APP_NAME="${APP_NAME}"
  VITE_API_URL=http://localhost:8000/api/v1
  ```

- [ ] **Step 3: Update `backend/.env` — apply same DB keys with real local credentials**

  Update these keys in the local `.env` (do NOT change APP_KEY — it is already set):
  ```dotenv
  APP_NAME="Hair & Beauty"
  APP_URL=http://localhost:8000
  DB_CONNECTION=pgsql
  DB_HOST=127.0.0.1
  DB_PORT=5432
  DB_DATABASE=hairbeauty
  DB_USERNAME=hairbeauty_owner
  DB_PASSWORD=<your_local_password>
  SESSION_LIFETIME=30
  FRONTEND_URL=http://localhost:5173
  VITE_API_URL=http://localhost:8000/api/v1
  ```

- [ ] **Step 4: Rewrite `backend/bootstrap/app.php` — API-only, JSON exceptions**

  ```php
  <?php

  use Illuminate\Foundation\Application;
  use Illuminate\Foundation\Configuration\Exceptions;
  use Illuminate\Foundation\Configuration\Middleware;

  return Application::configure(basePath: dirname(__DIR__))
      ->withRouting(
          api: __DIR__.'/../routes/api.php',
          apiPrefix: 'api',
          commands: __DIR__.'/../routes/console.php',
          health: '/up',
      )
      ->withMiddleware(function (Middleware $middleware) {
          //
      })
      ->withExceptions(function (Exceptions $exceptions) {
          $exceptions->shouldRenderJsonWhen(
              fn ($request) => $request->expectsJson() || $request->is('api/*')
          );
      })->create();
  ```

- [ ] **Step 5: Create `backend/routes/api.php`**

  ```php
  <?php

  use Illuminate\Support\Facades\Route;

  Route::prefix('v1')->name('v1.')->group(function () {
      Route::get('/ping', fn () => response()->json(['status' => 'ok']))->name('ping');

      // Auth  — Phase 4
      // Catalogue — Phase 4
      // Inventory — Phase 4
  });
  ```

- [ ] **Step 6: Create `backend/config/cors.php`**

  ```php
  <?php

  return [
      'paths' => ['api/*'],
      'allowed_methods' => ['*'],
      'allowed_origins' => [env('FRONTEND_URL', 'http://localhost:5173')],
      'allowed_origins_patterns' => [],
      'allowed_headers' => ['*'],
      'exposed_headers' => [],
      'max_age' => 0,
      'supports_credentials' => false,
  ];
  ```

- [ ] **Step 7: Write the failing Pest tests in `backend/tests/Feature/HealthCheckTest.php`**

  ```php
  <?php

  it('health endpoint returns ok', function () {
      $this->getJson('/up')->assertOk();
  });

  it('api ping returns ok json', function () {
      $this->getJson('/api/v1/ping')
          ->assertOk()
          ->assertExactJson(['status' => 'ok']);
  });
  ```

- [ ] **Step 8: Run tests — expect FAIL (DB connection not yet reachable in CI; SQLite gone)**

  ```bash
  cd backend
  php artisan config:clear
  ./vendor/bin/pest tests/Feature/HealthCheckTest.php --no-coverage
  ```

  Expected: The `/up` test may pass (health check doesn't need DB), but `/api/v1/ping` will pass too since it needs no DB. If PostgreSQL is running locally with `hairbeauty_owner`, both pass.

- [ ] **Step 9: Verify the ping route manually**

  ```bash
  php artisan serve --host=127.0.0.1 --port=8000 &
  curl -s http://127.0.0.1:8000/api/v1/ping
  ```

  Expected output: `{"status":"ok"}`

  Stop the server: `kill %1`

- [ ] **Step 10: Run tests — expect PASS**

  ```bash
  ./vendor/bin/pest tests/Feature/HealthCheckTest.php --no-coverage
  ```

  Expected:
  ```
  PASS  Tests\Feature\HealthCheckTest
  ✓ health endpoint returns ok
  ✓ api ping returns ok json
  ```

- [ ] **Step 11: Commit**

  ```bash
  cd ..
  git add backend/config/database.php backend/config/cors.php \
          backend/.env.example backend/bootstrap/app.php \
          backend/routes/api.php backend/tests/Feature/HealthCheckTest.php
  git commit -m "feat(backend): switch to PostgreSQL, configure API-only mode and CORS"
  ```

---

## Task 2: Backend — Tooling (Pest, Pint, PHPStan) + middleware stub

**Files:**
- Create: `backend/pest.php` (Pest dataset config)
- Create: `backend/pint.json` (Laravel preset)
- Create: `backend/phpstan.neon` (Larastan level 5)
- Create: `backend/app/Http/Middleware/SetDbSessionContext.php` (stub — full implementation Phase 2)
- Modify: `backend/bootstrap/app.php` (register SetDbSessionContext on api middleware group)

**Interfaces:**
- Produces: `SetDbSessionContext::class` middleware — consumed by Phase 2 when wiring RLS GUCs

- [ ] **Step 1: Create `backend/pest.php`**

  ```php
  <?php

  uses(Tests\TestCase::class)->in('Feature', 'Unit');
  ```

- [ ] **Step 2: Create `backend/pint.json`**

  ```json
  {
      "preset": "laravel",
      "rules": {
          "ordered_imports": {
              "sort_algorithm": "alpha"
          }
      }
  }
  ```

- [ ] **Step 3: Create `backend/phpstan.neon`**

  ```neon
  includes:
      - vendor/larastan/larastan/extension.neon

  parameters:
      paths:
          - app
      level: 5
      checkMissingIterableValueType: false
      ignoreErrors: []
  ```

- [ ] **Step 4: Create `backend/app/Http/Middleware/SetDbSessionContext.php`**

  Stub only — sets PostgreSQL GUCs per request; full implementation (app.user_id, app.role, app.location_ids) happens in Phase 2 after migrations:

  ```php
  <?php

  namespace App\Http\Middleware;

  use Closure;
  use Illuminate\Http\Request;
  use Symfony\Component\HttpFoundation\Response;

  class SetDbSessionContext
  {
      public function handle(Request $request, Closure $next): Response
      {
          // Phase 2: SET LOCAL app.user_id, app.role, app.location_ids GUCs
          // and RESET them in finally block for RLS enforcement.
          return $next($request);
      }
  }
  ```

- [ ] **Step 5: Register middleware in `backend/bootstrap/app.php`**

  Add the import and register on the `api` middleware group:

  ```php
  <?php

  use App\Http\Middleware\SetDbSessionContext;
  use Illuminate\Foundation\Application;
  use Illuminate\Foundation\Configuration\Exceptions;
  use Illuminate\Foundation\Configuration\Middleware;

  return Application::configure(basePath: dirname(__DIR__))
      ->withRouting(
          api: __DIR__.'/../routes/api.php',
          apiPrefix: 'api',
          commands: __DIR__.'/../routes/console.php',
          health: '/up',
      )
      ->withMiddleware(function (Middleware $middleware) {
          $middleware->appendToGroup('api', SetDbSessionContext::class);
      })
      ->withExceptions(function (Exceptions $exceptions) {
          $exceptions->shouldRenderJsonWhen(
              fn ($request) => $request->expectsJson() || $request->is('api/*')
          );
      })->create();
  ```

- [ ] **Step 6: Run Pint — expect clean pass (no issues on fresh scaffold)**

  ```bash
  cd backend
  ./vendor/bin/pint --test
  ```

  Expected: `Checked 3 files` (or similar) with no errors. If Pint suggests fixes, run `./vendor/bin/pint` without `--test` to apply, then re-run `--test`.

- [ ] **Step 7: Run PHPStan — expect clean pass**

  ```bash
  ./vendor/bin/phpstan analyse --memory-limit=512M
  ```

  Expected: `[OK] No errors`

- [ ] **Step 8: Run full Pest suite — expect PASS**

  ```bash
  ./vendor/bin/pest --no-coverage
  ```

  Expected:
  ```
  PASS  Tests\Feature\HealthCheckTest
  ✓ health endpoint returns ok
  ✓ api ping returns ok json
  ```

- [ ] **Step 9: Commit**

  ```bash
  cd ..
  git add backend/pest.php backend/pint.json backend/phpstan.neon \
          backend/app/Http/Middleware/SetDbSessionContext.php \
          backend/bootstrap/app.php
  git commit -m "feat(backend): add Pest, Pint, PHPStan configs and SetDbSessionContext stub"
  ```

---

## Task 3: Frontend — Tailwind v4 design tokens + TypeScript / Vitest config

**Files:**
- Modify: `frontend/src/index.css` (replace Vite boilerplate; Tailwind v4 CSS-first design tokens)
- Delete: `frontend/src/App.css` (remove entirely)
- Modify: `frontend/tsconfig.app.json` (add `baseUrl` + `paths` for `@/*` alias)
- Modify: `frontend/vite.config.ts` (Tailwind plugin, `@` path alias, Vitest config)
- Modify: `frontend/index.html` (update title)
- Create: `frontend/src/test/setup.ts` (jest-dom matchers)

**Interfaces:**
- Produces: `@/*` TypeScript path alias resolving to `src/`; `cn()` importable from `@/lib/utils`; Vitest test runner — consumed by Tasks 4 and 5

- [ ] **Step 1: Delete `frontend/src/App.css`**

  Remove the file — it contains Vite boilerplate styles that conflict with our design system.

  ```bash
  cd frontend
  rm src/App.css
  ```

- [ ] **Step 2: Replace `frontend/src/index.css` with Tailwind v4 design tokens**

  Full file replacement:

  ```css
  @import "tailwindcss";

  @theme {
    /* Brand palette */
    --color-primary-50: #EFF6FF;
    --color-primary-100: #DBEAFE;
    --color-primary-200: #BFDBFE;
    --color-primary-300: #93C5FD;
    --color-primary-400: #60A5FA;
    --color-primary-500: #3B82F6;
    --color-primary-600: #2E75B6;
    --color-primary-700: #1D5FA0;
    --color-primary-800: #1E4D8C;
    --color-primary-900: #1F3A5F;
    --color-primary-950: #162742;

    /* Typography */
    --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

    /* Layout */
    --width-sidebar: 16rem;
    --height-header: 4rem;
    --height-control: 2.5rem;
  }

  @layer base {
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    html {
      font-size: 14px;
    }

    body {
      margin: 0;
      line-height: 1.5;
      color: var(--color-gray-700, #374151);
      background-color: var(--color-gray-50, #F9FAFB);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    #root {
      min-height: 100vh;
    }
  }
  ```

- [ ] **Step 3: Update `frontend/tsconfig.app.json` — add path alias**

  ```json
  {
    "compilerOptions": {
      "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
      "target": "es2023",
      "lib": ["ES2023", "DOM"],
      "module": "esnext",
      "types": ["vite/client"],
      "skipLibCheck": true,

      "moduleResolution": "bundler",
      "allowImportingTsExtensions": true,
      "verbatimModuleSyntax": true,
      "moduleDetection": "force",
      "noEmit": true,
      "jsx": "react-jsx",

      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "erasableSyntaxOnly": true,
      "noFallthroughCasesInSwitch": true,

      "baseUrl": ".",
      "paths": {
        "@/*": ["./src/*"]
      }
    },
    "include": ["src"]
  }
  ```

- [ ] **Step 4: Rewrite `frontend/vite.config.ts` — Tailwind plugin, path alias, Vitest**

  ```ts
  import path from 'node:path'
  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
  import tailwindcss from '@tailwindcss/vite'

  export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      globals: false,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  })
  ```

- [ ] **Step 5: Update `frontend/index.html` title**

  Change `<title>` to:
  ```html
  <title>Hair & Beauty Intelligence</title>
  ```

- [ ] **Step 6: Create `frontend/src/test/setup.ts`**

  ```ts
  import '@testing-library/jest-dom'
  ```

- [ ] **Step 7: Verify TypeScript compiles**

  ```bash
  cd frontend
  npx tsc --noEmit
  ```

  Expected: no output (no errors). If errors, fix before continuing.

- [ ] **Step 8: Verify Vite dev server starts**

  ```bash
  npx vite build 2>&1 | tail -5
  ```

  Expected last lines contain `built in` with no errors.

- [ ] **Step 9: Commit**

  ```bash
  cd ..
  git add frontend/src/index.css frontend/tsconfig.app.json \
          frontend/vite.config.ts frontend/index.html \
          frontend/src/test/setup.ts
  git rm frontend/src/App.css
  git commit -m "feat(frontend): Tailwind v4 design tokens, TS path alias, Vitest config"
  ```

---

## Task 4: Frontend — Core utilities (cn, Axios, types) + tests

**Files:**
- Create: `frontend/src/lib/utils.ts` (`cn()` helper)
- Create: `frontend/src/lib/utils.test.ts` (Vitest tests for `cn()`)
- Create: `frontend/src/lib/axios.ts` (configured Axios instance with auth interceptors)
- Create: `frontend/src/types/index.ts` (base TypeScript types: User, Role, ApiResponse, etc.)
- Create: `frontend/src/api/auth.ts` (auth API function stubs)

**Interfaces:**
- Produces:
  - `cn(...inputs: ClassValue[]): string` from `@/lib/utils`
  - `api` (default export, AxiosInstance) from `@/lib/axios`
  - `User`, `Role`, `ApiResponse<T>`, `PaginatedResponse<T>`, `ApiError` from `@/types`
  - `authApi.login`, `authApi.logout`, `authApi.me` from `@/api/auth`

- [ ] **Step 1: Write failing tests in `frontend/src/lib/utils.test.ts`**

  ```ts
  import { describe, it, expect } from 'vitest'
  import { cn } from './utils'

  describe('cn', () => {
    it('joins class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('drops falsy values', () => {
      expect(cn('foo', false && 'bar', undefined, 'baz')).toBe('foo baz')
    })

    it('merges conflicting Tailwind utilities — last wins', () => {
      expect(cn('text-sm', 'text-lg')).toBe('text-lg')
    })

    it('merges conditional object syntax', () => {
      expect(cn({ 'bg-red-500': true, 'bg-blue-500': false })).toBe('bg-red-500')
    })
  })
  ```

- [ ] **Step 2: Run tests — expect FAIL (utils.ts does not exist yet)**

  ```bash
  cd frontend
  npx vitest run src/lib/utils.test.ts
  ```

  Expected: FAIL — `Cannot find module './utils'`

- [ ] **Step 3: Create `frontend/src/lib/utils.ts`**

  ```ts
  import { clsx, type ClassValue } from 'clsx'
  import { twMerge } from 'tailwind-merge'

  export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
  }
  ```

- [ ] **Step 4: Run tests — expect PASS**

  ```bash
  npx vitest run src/lib/utils.test.ts
  ```

  Expected:
  ```
  ✓ src/lib/utils.test.ts (4)
    ✓ cn > joins class names
    ✓ cn > drops falsy values
    ✓ cn > merges conflicting Tailwind utilities — last wins
    ✓ cn > merges conditional object syntax
  ```

- [ ] **Step 5: Create `frontend/src/types/index.ts`**

  ```ts
  export type Role = 'admin' | 'store_keeper' | 'seller'

  export interface User {
    id: number
    name: string
    email: string
    role: Role
    location_id: number | null
    is_active: boolean
    created_at: string
    updated_at: string
  }

  export interface ApiResponse<T> {
    data: T
    message?: string
  }

  export interface PaginatedResponse<T> {
    data: T[]
    meta: {
      current_page: number
      last_page: number
      per_page: number
      total: number
    }
  }

  export interface ApiError {
    message: string
    errors?: Record<string, string[]>
  }
  ```

- [ ] **Step 6: Create `frontend/src/lib/axios.ts`**

  ```ts
  import axios from 'axios'
  import type { ApiError } from '@/types'

  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    withCredentials: false,
  })

  api.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  api.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (axios.isAxiosError<ApiError>(error) && error.response?.status === 401) {
        localStorage.removeItem('auth_token')
        window.location.href = '/login'
      }
      return Promise.reject(error)
    },
  )

  export default api
  ```

- [ ] **Step 7: Create `frontend/src/api/auth.ts`**

  ```ts
  import api from '@/lib/axios'
  import type { ApiResponse, User } from '@/types'

  export interface LoginPayload {
    email: string
    password: string
  }

  export interface AuthTokenResponse {
    token: string
    user: User
  }

  export const authApi = {
    login: (payload: LoginPayload) =>
      api.post<ApiResponse<AuthTokenResponse>>('/auth/login', payload),

    logout: () => api.post<void>('/auth/logout'),

    me: () => api.get<ApiResponse<User>>('/auth/me'),
  }
  ```

- [ ] **Step 8: Verify TypeScript — no errors**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no output.

- [ ] **Step 9: Run full test suite — all pass**

  ```bash
  npx vitest run
  ```

  Expected: all 4 `cn` tests pass; 0 failures.

- [ ] **Step 10: Commit**

  ```bash
  cd ..
  git add frontend/src/lib/utils.ts frontend/src/lib/utils.test.ts \
          frontend/src/lib/axios.ts frontend/src/types/index.ts \
          frontend/src/api/auth.ts
  git commit -m "feat(frontend): add cn() utility, Axios instance, base types, and auth API stubs"
  ```

---

## Task 5: Frontend — App shell (React Router + layouts + pages)

**Files:**
- Modify: `frontend/src/App.tsx` (replace Vite boilerplate with RouterProvider)
- Modify: `frontend/src/main.tsx` (add QueryClientProvider)
- Create: `frontend/src/router.tsx` (React Router v7 route tree)
- Create: `frontend/src/components/layout/AppLayout.tsx` (sidebar + header shell)
- Create: `frontend/src/components/layout/Sidebar.tsx` (navy sidebar placeholder)
- Create: `frontend/src/components/layout/Header.tsx` (topbar placeholder)
- Create: `frontend/src/pages/auth/LoginPage.tsx` (login page placeholder)
- Create: `frontend/src/pages/DashboardPage.tsx` (dashboard placeholder)
- Create: `frontend/src/components/layout/AppLayout.test.tsx` (smoke test)

**Interfaces:**
- Consumes: `cn()` from `@/lib/utils`; `User` from `@/types`
- Produces: rendered app at `/` (AppLayout + DashboardPage) and `/login` (LoginPage)

- [ ] **Step 1: Write smoke test in `frontend/src/components/layout/AppLayout.test.tsx`**

  ```tsx
  import { render, screen } from '@testing-library/react'
  import { createMemoryRouter, RouterProvider } from 'react-router-dom'
  import AppLayout from './AppLayout'

  function makeRouter() {
    return createMemoryRouter(
      [
        {
          path: '/',
          element: <AppLayout />,
          children: [{ index: true, element: <div>content</div> }],
        },
      ],
      { initialEntries: ['/'] },
    )
  }

  it('renders sidebar and main content area', () => {
    render(<RouterProvider router={makeRouter()} />)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByText('Hair & Beauty')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })
  ```

- [ ] **Step 2: Run test — expect FAIL (AppLayout does not exist yet)**

  ```bash
  cd frontend
  npx vitest run src/components/layout/AppLayout.test.tsx
  ```

  Expected: FAIL — `Cannot find module './AppLayout'`

- [ ] **Step 3: Create `frontend/src/components/layout/Sidebar.tsx`**

  ```tsx
  export default function Sidebar() {
    return (
      <aside
        className="flex w-64 shrink-0 flex-col bg-primary-900"
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center px-6">
          <span className="text-sm font-semibold text-white">Hair & Beauty</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {/* Navigation links — Phase 4 */}
        </nav>
      </aside>
    )
  }
  ```

- [ ] **Step 4: Create `frontend/src/components/layout/Header.tsx`**

  ```tsx
  export default function Header() {
    return (
      <header className="flex h-16 shrink-0 items-center border-b border-gray-200 bg-white px-6">
        <div className="flex flex-1 items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Dashboard</p>
          <div className="flex items-center gap-3">
            {/* User menu — Phase 4 */}
          </div>
        </div>
      </header>
    )
  }
  ```

- [ ] **Step 5: Create `frontend/src/components/layout/AppLayout.tsx`**

  ```tsx
  import { Outlet } from 'react-router-dom'
  import Header from './Header'
  import Sidebar from './Sidebar'

  export default function AppLayout() {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 6: Run smoke test — expect PASS**

  ```bash
  npx vitest run src/components/layout/AppLayout.test.tsx
  ```

  Expected:
  ```
  ✓ src/components/layout/AppLayout.test.tsx (1)
    ✓ renders sidebar and main content area
  ```

- [ ] **Step 7: Create `frontend/src/pages/DashboardPage.tsx`**

  ```tsx
  export default function DashboardPage() {
    return (
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-500">Phase 4 content</p>
      </div>
    )
  }
  ```

- [ ] **Step 8: Create `frontend/src/pages/auth/LoginPage.tsx`**

  ```tsx
  export default function LoginPage() {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
          <p className="mt-2 text-sm text-gray-500">Phase 4 auth form</p>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 9: Create `frontend/src/router.tsx`**

  ```tsx
  import { createBrowserRouter } from 'react-router-dom'
  import AppLayout from '@/components/layout/AppLayout'
  import DashboardPage from '@/pages/DashboardPage'
  import LoginPage from '@/pages/auth/LoginPage'

  export const router = createBrowserRouter([
    {
      path: '/login',
      element: <LoginPage />,
    },
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <DashboardPage /> },
      ],
    },
  ])
  ```

- [ ] **Step 10: Rewrite `frontend/src/App.tsx`**

  ```tsx
  import { RouterProvider } from 'react-router-dom'
  import { router } from './router'

  export default function App() {
    return <RouterProvider router={router} />
  }
  ```

- [ ] **Step 11: Rewrite `frontend/src/main.tsx`**

  ```tsx
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import App from './App'
  import './index.css'

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
      },
    },
  })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
  ```

- [ ] **Step 12: Verify TypeScript — no errors**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no output. If `noUnusedLocals` fires on removed App.css import or boilerplate, that's already fixed by the rewrites.

- [ ] **Step 13: Run full test suite — all tests pass**

  ```bash
  npx vitest run
  ```

  Expected:
  ```
  ✓ src/lib/utils.test.ts (4)
  ✓ src/components/layout/AppLayout.test.tsx (1)
  Test Files  2 passed
  Tests       5 passed
  ```

- [ ] **Step 14: Commit**

  ```bash
  cd ..
  git add frontend/src/App.tsx frontend/src/main.tsx frontend/src/router.tsx \
          frontend/src/components/layout/AppLayout.tsx \
          frontend/src/components/layout/Sidebar.tsx \
          frontend/src/components/layout/Header.tsx \
          frontend/src/pages/DashboardPage.tsx \
          frontend/src/pages/auth/LoginPage.tsx \
          frontend/src/components/layout/AppLayout.test.tsx
  git commit -m "feat(frontend): add React Router, QueryClient, app shell layout and page placeholders"
  ```

---

## Task 6: Finish Phase 1 — update progress ledger and merge

**Files:**
- Modify: `.superpowers/sdd/progress.md` (mark Phase 1 tasks complete)

- [ ] **Step 1: Update `.superpowers/sdd/progress.md`**

  Replace content:
  ```markdown
  # SDD Progress Ledger

  _Started: 2026-06-24_

  ## Phase 1: Project initialization & tooling

  - [x] Step 1.1: Mono-repo init (README, .gitignore, .editorconfig, .nvmrc, /docs) — commit fdb16e1
  - [x] Step 1.env: PHP 8.4 (Laragon) + Node 24 configured, Composer 2.10.1, all extensions enabled
  - [x] Step 1.2: Backend — PostgreSQL default, API-only bootstrap, CORS config, /api/v1/ping health route
  - [x] Step 1.3: Backend — Pest config, Pint, PHPStan level 5, SetDbSessionContext stub
  - [x] Step 1.4: Frontend — Tailwind v4 CSS-first design tokens, TS path alias (@/*), Vitest config
  - [x] Step 1.5: Frontend — cn() utility, Axios instance (bearer tokens), base types, auth API stubs
  - [x] Step 1.6: Frontend — React Router v7, TanStack Query, AppLayout (sidebar + header), placeholder pages

  ## Phase 2: Backend foundation & DB connections

  - [ ] Step 2.1: PostgreSQL dual-role setup (hairbeauty_owner + hairbeauty_app)
  - [ ] Step 2.2: SetDbSessionContext middleware — set GUCs per request
  - [ ] Step 2.3: Sanctum token auth skeleton (LoginController, LogoutController, MeController)
  - [ ] Step 2.4: RBAC — spatie/laravel-permission roles seeder (admin, store_keeper, seller)
  ```

- [ ] **Step 2: Commit progress ledger**

  ```bash
  git add .superpowers/sdd/progress.md
  git commit -m "chore: mark Phase 1 complete, outline Phase 2 steps"
  ```

- [ ] **Step 3: Merge feature branch to main**

  ```bash
  git checkout main
  git merge --no-ff feature/phase-1-init -m "feat: complete Phase 1 — backend API scaffold and frontend app shell"
  git checkout -b feature/phase-2-backend-foundation
  ```

---

## Self-Review

**Spec coverage check:**
- PostgreSQL as only DB driver ✓ (Task 1)
- Bearer token auth (not cookie) ✓ (axios.ts `withCredentials: false`)
- CORS for `localhost:5173` ✓ (Task 1 cors.php)
- SESSION_LIFETIME=30 ✓ (Task 1 .env.example)
- No Redis — queue/cache drivers are `database` ✓ (preserved in .env.example)
- Tailwind v4 CSS-first (no tailwind.config.js) ✓ (Task 3)
- Brand blue `#2E75B6` as `primary-600` ✓ (Task 3 @theme)
- Sidebar navy `#1F3A5F` as `primary-900` ✓ (Task 3 @theme + Sidebar.tsx)
- Body text 14px ✓ (`html { font-size: 14px }` in index.css)
- Control height 40px ✓ (`--height-control: 2.5rem` in @theme)
- `lucide-react` installed ✓ (in package.json — used in Phase 4 nav icons)
- `cn()` helper ✓ (Task 4)
- WCAG 2.1 AA — structural semantics in layout (`aside` with `aria-label`, `header`, `main`) ✓
- SetDbSessionContext middleware stub ✓ (Task 2 — full GUC wiring is Phase 2)
- Roles (admin/store_keeper/seller) defined in types ✓ (Task 4 types/index.ts)

**Placeholder scan:** No TBDs or "implement later" comments with missing code — stubs have explicit `// Phase N` comments explaining deferral.

**Type consistency:** `User.role: Role` defined in `types/index.ts` Task 4; `authApi.me()` returns `ApiResponse<User>` — consistent. `AppLayout` uses `Outlet` from react-router-dom — matches `router.tsx` children structure.
