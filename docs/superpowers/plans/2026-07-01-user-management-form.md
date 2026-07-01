# User Management — Add & Edit User Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Add User" and "Edit User" modal forms to `UsersPage.tsx` so admins can create and update users without leaving the page.

**Architecture:** All new code lives in `frontend/src/pages/UsersPage.tsx`. An inline `UserFormModal` component owns the form (RHF + Zod). `UsersPage` owns modal open/close state and passes it down. No new files, no new routes.

**Tech Stack:** React 19, TypeScript 5.9, React Hook Form 7, `@hookform/resolvers` 5, Zod 4 (`zod/v4` sub-path), TanStack Query 5, Tailwind CSS v4, `lucide-react`.

## Global Constraints

- Import Zod as `import { z } from 'zod/v4'` — NOT `'zod'`
- Use `z.email()` for email validation — NOT `z.string().email()`
- Control height: `h-10`; input class pattern: `"mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"`
- Icons from `lucide-react` only
- Tailwind v4 CSS-first — use token classes `primary-600`, `primary-700` etc.; no `tailwind.config.js`
- PHP binary (backend tests, not needed here): `C:\Laragon\bin\php\php-8.4.12-nts-Win32-vs17-x64\php.exe`
- TypeScript check: `cd frontend && npx tsc --noEmit` (PowerShell)
- No new Vitest tests — manual UAT is the verification gate per spec

---

## Task 1: Implement UserFormModal + wire UsersPage

**Files:**
- Modify: `frontend/src/pages/UsersPage.tsx` (full rewrite)

**Interfaces:**
- Consumes:
  - `usersApi.list()` → `PaginatedResponse<User>` (existing)
  - `usersApi.create(payload)` → `ApiResponse<User>` (existing)
  - `usersApi.update(id, payload)` → `ApiResponse<User>` (existing)
  - `locationsApi.list()` → `{ data: Location[] }` (existing)
  - `User` from `@/types`
  - `Location` from `@/api/locations`
- Produces: nothing (leaf component)

- [ ] **Step 1: Replace `UsersPage.tsx` with the full implementation**

Write the complete file below. It replaces the existing 23-line read-only page.

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useController } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { Pencil, Plus, X } from 'lucide-react'
import { usersApi } from '@/api/users'
import { locationsApi } from '@/api/locations'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'
import type { User } from '@/types'

// ── Schema factory — password required on create, optional on edit ──────────
function makeSchema(mode: 'create' | 'edit') {
  return z.object({
    name:        z.string().min(2, 'Name must be at least 2 characters'),
    email:       z.email('Valid email required'),
    password:    mode === 'create'
      ? z.string().min(8, 'Password must be at least 8 characters')
      : z.union([z.string().min(8, 'Password must be at least 8 characters'), z.literal('')]),
    role:        z.enum(['admin', 'store_keeper', 'seller']),
    location_id: z.number().nullable().optional(),
    is_active:   z.boolean().optional(),
  }).superRefine((data, ctx) => {
    if (data.role === 'seller' && !data.location_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['location_id'],
        message: 'Location is required for sellers.',
      })
    }
  })
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>

// ── Modal ──────────────────────────────────────────────────────────────────
function UserFormModal({ mode, user, onClose }: {
  mode: 'create' | 'edit'
  user: User | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.data.data),
  })

  const { register, handleSubmit, watch, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(makeSchema(mode)),
    defaultValues: mode === 'edit' && user
      ? {
          name:        user.name,
          email:       user.email,
          password:    '',
          role:        user.role,
          location_id: user.location_id,
          is_active:   user.is_active,
        }
      : {
          name:        '',
          email:       '',
          password:    '',
          role:        'seller',
          location_id: null,
          is_active:   true,
        },
  })

  const { field: locationField } = useController({ name: 'location_id', control })
  const selectedRole = watch('role')

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (mode === 'create') {
        return usersApi.create({
          name:        values.name,
          email:       values.email,
          password:    values.password as string,
          role:        values.role,
          location_id: values.location_id ?? undefined,
        })
      }
      const payload: Parameters<typeof usersApi.update>[1] = {
        name:        values.name,
        email:       values.email,
        role:        values.role,
        location_id: values.location_id ?? null,
        is_active:   values.is_active,
      }
      if (values.password) payload.password = values.password
      return usersApi.update(user!.id, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      setServerError(msg ?? 'An error occurred. Please try again.')
    },
  })

  const activeLocations = (locations ?? []).filter(l => l.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'create' ? 'Add User' : 'Edit User'}
          </h2>
          <button onClick={onClose} aria-label="Close dialog"
            className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit(values => { setServerError(null); mutation.mutate(values) })}
          className="space-y-4"
        >
          {/* Name */}
          <div>
            <label htmlFor="u-name" className="block text-sm font-medium text-gray-700">Name</label>
            <input id="u-name" type="text" {...register('name')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="u-email" className="block text-sm font-medium text-gray-700">Email</label>
            <input id="u-email" type="email" {...register('email')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="u-password" className="block text-sm font-medium text-gray-700">
              Password
              {mode === 'edit' && (
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (leave blank to keep current)
                </span>
              )}
            </label>
            <input id="u-password" type="password" {...register('password')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600" />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>

          {/* Role */}
          <div>
            <label htmlFor="u-role" className="block text-sm font-medium text-gray-700">Role</label>
            <select id="u-role" {...register('role')}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600">
              <option value="admin">Admin</option>
              <option value="store_keeper">Store Keeper</option>
              <option value="seller">Seller</option>
            </select>
            {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role.message}</p>}
          </div>

          {/* Location */}
          <div>
            <label htmlFor="u-location" className="block text-sm font-medium text-gray-700">
              Location
              {selectedRole === 'seller' && <span className="ml-1 text-red-500">*</span>}
            </label>
            <select
              id="u-location"
              value={locationField.value ?? ''}
              onChange={e => locationField.onChange(
                e.target.value === '' ? null : Number(e.target.value)
              )}
              onBlur={locationField.onBlur}
              className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
            >
              <option value="">— None —</option>
              {activeLocations.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
              ))}
            </select>
            {errors.location_id && (
              <p className="mt-1 text-xs text-red-600">{errors.location_id.message}</p>
            )}
          </div>

          {/* Is Active — edit only */}
          {mode === 'edit' && (
            <div className="flex items-center gap-2">
              <input id="u-active" type="checkbox" {...register('is_active')}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
              <label htmlFor="u-active" className="text-sm font-medium text-gray-700">Active</label>
            </div>
          )}

          {/* Server error */}
          {serverError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="h-10 px-4 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="h-10 px-4 rounded-md bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : mode === 'create' ? 'Add User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Table column definitions ───────────────────────────────────────────────
const BASE_COLUMNS = [
  { key: 'name',  header: 'Name' },
  { key: 'email', header: 'Email' },
  {
    key: 'role',
    header: 'Role',
    render: (u: User) => <Badge>{u.role.replace('_', ' ')}</Badge>,
  },
  {
    key: 'is_active',
    header: 'Status',
    render: (u: User) => (
      <Badge variant={u.is_active ? 'success' : 'danger'}>
        {u.is_active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
]

// ── Page ──────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [modalMode, setModalMode]     = useState<'create' | 'edit' | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data),
  })

  const openCreate = () => { setEditingUser(null); setModalMode('create') }
  const openEdit   = (u: User) => { setEditingUser(u); setModalMode('edit') }
  const closeModal = () => { setModalMode(null); setEditingUser(null) }

  const columns = [
    ...BASE_COLUMNS,
    {
      key: 'actions',
      header: '',
      render: (u: User) => (
        <button
          onClick={() => openEdit(u)}
          aria-label={`Edit ${u.name}`}
          className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
        >
          <Pencil size={12} /> Edit
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-10 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Plus size={16} /> Add User
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="No users found."
      />

      {modalMode && (
        <UserFormModal mode={modalMode} user={editingUser} onClose={closeModal} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no output (zero errors). If there are type errors, fix them before proceeding. Common issues:
- `errors.location_id.message` — Zod's `.superRefine()` produces a root-level issue; if `message` is undefined, wrap with `?? ''`
- `mutation.isPending` — correct for TanStack Query v5 (was `isLoading` in v4)

- [ ] **Step 3: Manual UAT — Add User flow**

Start backend (`/c/Laragon/bin/php/php-8.4.12-nts-Win32-vs17-x64/php.exe artisan serve`) and frontend (`cd frontend && npm run dev`). Log in as admin.

Navigate to **User Management** (`/users`).

Verify:
1. "Add User" button appears top-right ✓
2. Click "Add User" → modal opens with empty form, role defaults to Seller ✓
3. Submit empty form → validation errors appear inline for name, email, password, location (seller requires it) ✓
4. Enter name, email, password (7 chars) → password error "must be at least 8" ✓
5. Enter valid 8+ char password, role = Seller, no location → "Location is required for sellers" ✓
6. Set location, submit → 201, modal closes, user appears in table ✓
7. Role = Admin, no location → submits without location error ✓

- [ ] **Step 4: Manual UAT — Edit User flow**

1. Click "Edit" on any existing user row → modal opens pre-filled with that user's data ✓
2. Password field is empty; hint text "(leave blank to keep current)" is visible ✓
3. Change name only, leave password blank → save → user name updates, password unchanged ✓
4. Change role to Seller, clear location → "Location is required" ✓
5. Deselect "Active" checkbox → save → status badge changes to Inactive ✓
6. Enter a new password (min 8 chars) → save → can log in with new password ✓
7. Submit with duplicate email → server 422 error banner appears below form ✓

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/UsersPage.tsx
git commit -m "feat(users): add/edit user modal form with RHF+Zod validation"
```
