# User Management — Add & Edit User Forms

**Date:** 2026-07-01
**Scope:** Frontend only. Backend endpoints (`POST /users`, `PUT /users/{id}`) are already implemented and admin-only.

---

## Goal

Allow the admin to create new users and edit existing users from the User Management page, without leaving the page.

---

## Architecture

All new code lives in `frontend/src/pages/UsersPage.tsx`. No new routes, no new files.

Two state values drive the modal:
- `modalMode: 'create' | 'edit' | null` — `null` = modal closed
- `editingUser: User | null` — populated when Edit is clicked, cleared on close

---

## Table Changes

- **Header**: Add an "Add User" button (primary blue, `Plus` icon, same style as "Record Purchase" in PurchasesPage).
- **Columns**: Keep existing four columns (Name, Email, Role badge, Status badge). Add a fifth action column containing an "Edit" link button (pencil icon or plain text, same low-key link style as the "Confirm" link in DistributionsPage).

The existing `DataTable` component handles this via a new column entry with a `render` function.

---

## Modal Form

### Fields

| Field | Input type | Create | Edit | Validation |
|---|---|---|---|---|
| Name | text | required | required | min 2 chars |
| Email | email | required | required | valid email; unique (enforced server-side) |
| Password | password | required | optional | min 8 chars when provided |
| Role | select | required | required | one of: admin, store_keeper, seller |
| Location | select | optional* | optional* | required when role = seller |
| Active | checkbox | hidden (defaults true) | shown | boolean |

*Location dropdown shows active locations from `locationsApi.list()`. First option is "— None —". When role changes to seller, location becomes required (enforced via Zod `.superRefine()`).

### Password behaviour on edit

Password field is always shown in edit mode but never pre-filled. If left blank, the field is omitted from the `usersApi.update()` payload so the backend `UpdateUserRequest` (which uses `sometimes`) does not change the existing password. A helper text reads: "Leave blank to keep current password."

### Default values on open

- **Create mode**: all fields empty; `is_active` defaults to `true` (field hidden).
- **Edit mode**: pre-filled from the `User` row that was clicked.

---

## Validation

Handled by React Hook Form + Zod v4 (same pattern as `LoginPage.tsx`).

```
schema = z.object({
  name:        z.string().min(2),
  email:       z.string().email(),
  password:    z.string().min(8).optional().or(z.literal('')),
  role:        z.enum(['admin', 'store_keeper', 'seller']),
  location_id: z.number().nullable().optional(),
  is_active:   z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.role === 'seller' && !data.location_id) {
    ctx.addIssue({ code: 'custom', path: ['location_id'], message: 'Location is required for sellers.' })
  }
})
```

---

## Submit Behaviour

### Create
1. Call `usersApi.create(payload)` where `payload` omits `is_active` (defaults to true server-side via nullable rule).
2. On 201: invalidate `['users']` query, close modal.
3. On error: show red banner below form.

### Edit
1. Build a partial payload — omit `password` if the field is empty.
2. Call `usersApi.update(user.id, payload)`.
3. On 200: invalidate `['users']` query, close modal.
4. On error: show red banner below form.

### Error display

A single red `<p>` element below the form fields, same pattern as `ExpensesPage.tsx` and `NewSalePage.tsx`. Server 422 messages use the top-level `message` field from the API error response.

---

## Data Dependencies

- `locationsApi.list()` — fetched once when the modal first opens (via `useQuery` with `enabled: modalMode !== null`). Filtered to `l.is_active === true` in the component.
- `usersApi.create` / `usersApi.update` — already exist in `frontend/src/api/users.ts`.

---

## Cache Invalidation

On success (both create and edit): `qc.invalidateQueries({ queryKey: ['users'] })`.

---

## Styling

Follows the existing project conventions:
- Modal backdrop: semi-transparent overlay (`bg-black/40`)
- Modal panel: `bg-white rounded-lg shadow-xl p-6 w-full max-w-md`
- Control height: `h-10`
- Input class: `"mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"`
- Submit button: primary blue, disabled while pending
- Close button: "Cancel" text button or ✕ icon top-right

---

## Testing

No new Vitest tests required — the mutation + query invalidation pattern is already covered by the test strategy. Existing `UsersPage` is not tested. Manual UAT covers the add/edit flows.

---

## Out of Scope

- Password strength meter
- Delete / deactivate from a separate confirmation modal (is_active toggle on the edit form is sufficient)
- Pagination of the location dropdown (there are ≤ 4 locations at launch)
- Role-based field gating beyond the seller/location rule
