# Clients Page — Shop Filter + Result Count

## Purpose
Add a shop filter to the main Clients page toolbar and a visible count of
clients matching the current filters, so admin/store_keeper can narrow the
client list to one shop and immediately see how many clients that leaves.

## Why this is purely a frontend change
The backend (`ClientController::index()`) already supports a `location_id`
query param — used today only by the `CampaignExportModal` inside
`ClientsPage.tsx`, not by the main table's own toolbar. It's also already
role-aware: sellers are always forced to their own `location_id` regardless
of what's sent (`if ($user->role === 'seller') { $query->where('location_id',
$user->location_id); }`), while admin and store_keeper are not scoped by
default and can pass `location_id` to narrow the result. `Client::paginate(200)`
already returns `meta.total` as the count across the *entire filtered
result set*, not just the current page — so no new backend work is needed
for either the filter or the count.

## Scope
- **Who sees the filter:** admin and store_keeper. Not sellers — the
  backend ignores any `location_id` a seller sends and always forces their
  own location, so showing them a filter would be dead UI.
- **Count placement:** a count line directly below the toolbar, above the
  table, always visible (not gated behind pagination like today's "(Z
  total)" text, which only renders when `meta.last_page > 1`).

## Frontend

### `frontend/src/pages/ClientsPage.tsx` (modify)
- Add `const canFilterByShop = user?.role === 'admin' || user?.role === 'store_keeper'`.
- Add `const [locationId, setLocationId] = useState('')` state.
- Fetch shops via `locationsApi.list()` — reuse the same `['locations']`
  query key already used elsewhere in this file (by `ClientFormModal` and
  `CampaignExportModal`), so no duplicate network request.
- Add a "Shop" `<select>` in the toolbar (only when `canFilterByShop`),
  listing active locations, with an "All Shops" default option. On change,
  reset `page` to 1.
- Update the `['clients', ...]` query to include `locationId` in its key
  and pass `locationId ? Number(locationId) : undefined` as the
  `location_id` argument to `clientsApi.list()` (the API method already
  accepts this as its second positional argument).
- Add a count line below the toolbar: `{data.meta.total} client{s !== 1 ? 's' : ''}`,
  rendered whenever `data` is loaded (not gated on `last_page > 1`).
- Simplify the existing pagination footer's text from
  `Page X of Y (Z total)` to `Page X of Y`, since the total now has its own
  dedicated, always-visible line above the table — avoids showing the same
  number twice.

No backend changes. No new types — `Client`, `clientsApi.list`, and
`locationsApi.list` are all already shaped correctly for this.

## Out of scope
- No change to `CampaignExportModal`'s existing, separate shop filter.
- No change to seller-side behavior (still always scoped server-side).
- No new tests — this repo has no existing frontend test file for
  `ClientsPage`, and the change is UI-only wiring of already-tested backend
  behavior (the `location_id` filter and `meta.total` pagination are
  existing, already-relied-upon backend behavior, not new logic).

## Deployment
Commit, push to `develop`, verify Railway deploy picks it up automatically.
No new env vars or migrations.
