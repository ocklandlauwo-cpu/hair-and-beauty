# Most Asked Products

## Purpose
Let any staff member log a product a customer asked for, so the business
can see demand for products that may not be in stock — or not in the
catalog at all yet. Lives on the Products page as a new "Asked Products"
tab, alongside the existing catalog list.

## Key design decisions (confirmed with user)
1. **Free-text product name**, not tied to the product catalog. This is
   deliberately independent of `products` — it needs to capture demand for
   items the business doesn't carry yet, which existing catalog-bound
   reports (Low Stock, Slow Products) can't do since they only cover
   products that already exist as rows.
2. **Auto-detect duplicates on add**: submitting a name that already
   matches an existing entry at the same shop (case-insensitive, trimmed)
   increments that row instead of creating a new one.
3. **Placement**: a new tab on the Products page (introducing tabbed
   navigation there for the first time), not on the Stock page.

## Data model

### New table: `asked_products`
```php
Schema::create('asked_products', function (Blueprint $table) {
    $table->id();
    $table->foreignId('location_id')->constrained()->restrictOnDelete();
    $table->string('product_name', 200);
    $table->unsignedInteger('times_asked')->default(1);
    $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
    $table->timestamps();
});
```
- `updated_at` doubles as "recent date asked" — bumped every time the row
  is incremented (either via a duplicate `store()` call or the dedicated
  increment action). No separate `last_asked_at` column needed.
- `created_at` is the first-asked date (not displayed in the table, but a
  free, useful audit trail).
- `location_id` is required (not nullable) — every ask is tied to a shop.

### RLS
New migration (the historical RLS migration is not edited — this follows
the same pattern as a fresh table, mirroring `distributions`' shape rather
than the generic `LOCATION_SCOPED` loop, because store_keeper needs the
same unrestricted access as admin here, not seller-style location-scoping):

```sql
ALTER TABLE asked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE asked_products FORCE ROW LEVEL SECURITY;

CREATE POLICY asked_products_select ON asked_products FOR SELECT USING (
    current_setting('app.role', true) IN ('admin', 'store_keeper')
    OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
        COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
);

CREATE POLICY asked_products_insert ON asked_products FOR INSERT WITH CHECK (
    current_setting('app.role', true) IN ('admin', 'store_keeper')
    OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
        COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
);

CREATE POLICY asked_products_update ON asked_products FOR UPDATE USING (
    current_setting('app.role', true) IN ('admin', 'store_keeper')
    OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
        COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
);

CREATE POLICY asked_products_delete ON asked_products FOR DELETE USING (
    current_setting('app.role', true) = 'admin'
);
```

### Model + Policy
`App\Models\AskedProduct` — fillable `location_id`, `product_name`,
`times_asked`, `created_by`; belongsTo `Location`, `User` (creator).

`App\Policies\AskedProductPolicy` — mirrors `ClientPolicy`'s shape:
- `viewAny`: admin, store_keeper, seller (any authenticated role — "any
  user can add asked products").
- `create`: admin, store_keeper, seller.
- `update` (used for the increment action): admin/store_keeper
  unconditionally; seller only for their own `location_id`.
- `delete`: admin only.

## Backend API

### `AskedProductController` (new)
- `index()`: `$this->authorize('viewAny', AskedProduct::class)`. Seller is
  forced to their own `location_id` (RLS also enforces this — defense in
  depth, matching the `ClientController` pattern). Admin/store_keeper may
  pass `?location_id=` to filter, otherwise see all shops. Default order:
  `times_asked DESC, updated_at DESC` (surfaces the most-asked-for
  products first — this is the feature's whole purpose). Paginated,
  `per_page` capped like `ProductController` (`min($request->query(
  'per_page') ?? 50, 500)`).
- `store()`: `StoreAskedProductRequest` validates `product_name` (required,
  string, max 200) and `location_id` (required for admin/store_keeper,
  ignored/optional for seller — mirrors `StoreClientRequest`'s
  role-conditional rule, but extends the "required" branch to
  store_keeper as well as admin, matching this feature's broader
  shop-selection permission). Controller resolves the actual
  `$locationId`: admin/store_keeper use the validated value; seller always
  uses `$user->location_id`. Then looks for an existing row at that
  location whose `product_name` matches case-insensitively and trimmed
  (`whereRaw('LOWER(TRIM(product_name)) = LOWER(TRIM(?))', [$name])`); if
  found, increments `times_asked` and touches `updated_at` on that row and
  returns it; otherwise creates a new row with `times_asked = 1`.
- `destroy()`: `$this->authorize('delete', $askedProduct)`, admin only.

### `IncrementAskedProductController` (new, single-invoke)
`POST /asked-products/{askedProduct}/increment` — `$this->authorize(
'update', $askedProduct)`, increments `times_asked` by 1 and touches
`updated_at`. This is the table row's "+1 Asked" button — no name lookup,
just bumps a known row by id.

### Routes (add to `backend/routes/api.php`)
```php
Route::apiResource('/asked-products', AskedProductController::class)->only(['index', 'store', 'destroy']);
Route::post('/asked-products/{askedProduct}/increment', IncrementAskedProductController::class)->name('asked-products.increment');
```

## Frontend

### `frontend/src/api/askedProducts.ts` (new)
```ts
export interface AskedProduct {
  id: number
  location_id: number
  location_name: string | null
  product_name: string
  times_asked: number
  updated_at: string   // recent date asked
  created_at: string
}

export const askedProductsApi = {
  list: (page = 1, location_id?: number) => ...,   // GET /asked-products
  create: (data: { product_name: string; location_id?: number }) => ...,  // POST /asked-products
  increment: (id: number) => ...,   // POST /asked-products/{id}/increment
  delete: (id: number) => ...,      // DELETE /asked-products/{id}
}
```

### `frontend/src/pages/ProductsPage.tsx` (modify)
- Add a tab bar at the top, styled like `StockPage`'s existing tabs
  (`flex gap-1 border-b border-gray-200`, active tab `border-primary-600
  text-primary-600`): **"Catalog"** and **"Asked Products"**.
- The existing search/table/pagination/New Product content moves under
  the "Catalog" tab, unchanged.
- New **"Asked Products"** tab content:
  - Toolbar: "Add Asked Product" button (opens a modal: product name text
    input, required; shop `<select>`, required, shown only for
    admin/store_keeper — hidden for sellers, who are always scoped to
    their own shop server-side).
  - Shop filter `<select>` (admin/store_keeper only, mirrors the
    `canFilterByShop` pattern just shipped on the Clients page).
  - Always-visible count line ("N asked products"), same pattern as the
    Clients page.
  - Table columns: **Product** (`product_name`), **Recent Date Asked**
    (`updated_at`, formatted), **Times Asked** (`times_asked`), **Shop**
    (`location_name`), **Action** ("+1 Asked" button calling `increment`,
    plus a "Delete" link for admin).

## Tests
`backend/tests/Feature/Api/AskedProductTest.php`, mirroring
`DistributionTest.php`'s fixture style:
- Any authenticated role can list asked products.
- Seller creating an ask is always scoped to their own location,
  regardless of any `location_id` sent.
- Admin/store_keeper can create an ask for any shop.
- Creating a name that already exists (case-insensitive, trimmed) at the
  same shop increments the existing row rather than creating a duplicate.
- The same name at a *different* shop creates a separate row (not merged
  across shops).
- The dedicated increment endpoint bumps `times_asked` and updates
  `updated_at` for an existing row.
- A seller cannot increment or view a row belonging to another shop's
  location (RLS-enforced).
- Only admin can delete an entry.

## Out of scope
- No cross-referencing against the product catalog (by design — free text
  is the point).
- No edit-in-place for `product_name` (typos are handled by deleting and
  re-adding — admin only anyway).
- No CSV export or reporting integration (unlike the Clients WhatsApp
  export) — just the list + count + quick actions.

## Deployment
Commit, push to `develop`, verify Railway deploy picks it up
automatically. New migrations (`asked_products` table + RLS) will run
automatically — `backend/nixpacks.toml`'s `[start]` command already
includes `php artisan migrate --force` on every container start, so no
manual migration step is needed.
