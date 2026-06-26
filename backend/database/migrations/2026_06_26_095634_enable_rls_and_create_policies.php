<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    /** Tables that are location-scoped (seller sees only their location via location_id column). */
    private const LOCATION_SCOPED = [
        'clients', 'sales', 'reconciliations',
        'expenses', 'attendance',
    ];

    /** All tables managed by this migration (for rollback). */
    private const ALL_TABLES = [
        'locations', 'categories', 'products', 'batches',
        'purchases', 'purchase_items', 'stock_movements',
        'clients', 'sales', 'sale_items', 'reconciliations',
        'expenses', 'distributions', 'distribution_items', 'attendance',
        'news',
    ];

    public function up(): void
    {
        // ── locations ──────────────────────────────────────────────────
        DB::statement('ALTER TABLE locations ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE locations FORCE ROW LEVEL SECURITY');
        DB::statement("
            CREATE POLICY loc_select ON locations FOR SELECT USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )");
        DB::statement("CREATE POLICY loc_insert ON locations FOR INSERT
            WITH CHECK (current_setting('app.role', true) = 'admin')");
        DB::statement("CREATE POLICY loc_update ON locations FOR UPDATE
            USING (current_setting('app.role', true) = 'admin')");
        DB::statement("CREATE POLICY loc_delete ON locations FOR DELETE
            USING (current_setting('app.role', true) = 'admin')");

        // ── categories ─────────────────────────────────────────────────
        DB::statement('ALTER TABLE categories ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE categories FORCE ROW LEVEL SECURITY');
        DB::statement("CREATE POLICY cat_select ON categories FOR SELECT
            USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))");
        DB::statement("CREATE POLICY cat_write ON categories FOR ALL
            WITH CHECK (current_setting('app.role', true) = 'admin')");

        // ── products ───────────────────────────────────────────────────
        DB::statement('ALTER TABLE products ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE products FORCE ROW LEVEL SECURITY');
        DB::statement("CREATE POLICY prod_select ON products FOR SELECT
            USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))");
        DB::statement("CREATE POLICY prod_insert ON products FOR INSERT
            WITH CHECK (current_setting('app.role', true) = 'admin')");
        DB::statement("CREATE POLICY prod_update ON products FOR UPDATE
            USING (current_setting('app.role', true) = 'admin')");
        DB::statement("CREATE POLICY prod_delete ON products FOR DELETE
            USING (current_setting('app.role', true) = 'admin')");

        // ── batches ────────────────────────────────────────────────────
        DB::statement('ALTER TABLE batches ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE batches FORCE ROW LEVEL SECURITY');
        DB::statement("CREATE POLICY batch_select ON batches FOR SELECT
            USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))");
        DB::statement("CREATE POLICY batch_write ON batches FOR ALL
            WITH CHECK (current_setting('app.role', true) IN ('admin', 'store_keeper'))");

        // ── purchases & purchase_items ──────────────────────────────────
        foreach (['purchases', 'purchase_items'] as $t) {
            DB::statement("ALTER TABLE {$t} ENABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} FORCE ROW LEVEL SECURITY");
            DB::statement("CREATE POLICY {$t}_select ON {$t} FOR SELECT
                USING (current_setting('app.role', true) IN ('admin', 'store_keeper'))");
            DB::statement("CREATE POLICY {$t}_insert ON {$t} FOR INSERT
                WITH CHECK (current_setting('app.role', true) IN ('admin', 'store_keeper'))");
            DB::statement("CREATE POLICY {$t}_update ON {$t} FOR UPDATE
                USING (current_setting('app.role', true) = 'admin')");
        }

        // ── stock_movements ────────────────────────────────────────────
        DB::statement('ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY');
        DB::statement("
            CREATE POLICY stock_movements_select ON stock_movements FOR SELECT USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )");
        DB::statement("
            CREATE POLICY stock_movements_insert ON stock_movements FOR INSERT
            WITH CHECK (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))
        ");
        // Admin can attempt UPDATE/DELETE — the immutability trigger enforces the actual block
        DB::statement("
            CREATE POLICY stock_movements_update ON stock_movements FOR UPDATE
            USING (current_setting('app.role', true) = 'admin')
        ");
        DB::statement("
            CREATE POLICY stock_movements_delete ON stock_movements FOR DELETE
            USING (current_setting('app.role', true) = 'admin')
        ");

        // ── location-scoped tables (seller sees own location only) ──────
        $selectUsing = "
            current_setting('app.role', true) IN ('admin', 'store_keeper')
            OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
        ";
        $insertCheck = "
            current_setting('app.role', true) = 'admin'
            OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
        ";

        foreach (self::LOCATION_SCOPED as $t) {
            DB::statement("ALTER TABLE {$t} ENABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} FORCE ROW LEVEL SECURITY");
            DB::statement("CREATE POLICY {$t}_select ON {$t} FOR SELECT USING ({$selectUsing})");
            DB::statement("CREATE POLICY {$t}_insert ON {$t} FOR INSERT WITH CHECK ({$insertCheck})");
            DB::statement("CREATE POLICY {$t}_update ON {$t} FOR UPDATE USING (
                current_setting('app.role', true) = 'admin'
                OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )");
        }

        // ── distributions — scoped by to_location_id (not a plain location_id column)
        DB::statement('ALTER TABLE distributions ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE distributions FORCE ROW LEVEL SECURITY');
        DB::statement("
            CREATE POLICY distributions_select ON distributions FOR SELECT USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR to_location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )");
        DB::statement("CREATE POLICY distributions_insert ON distributions FOR INSERT
            WITH CHECK (current_setting('app.role', true) IN ('admin', 'store_keeper'))");
        DB::statement("CREATE POLICY distributions_update ON distributions FOR UPDATE
            USING (current_setting('app.role', true) IN ('admin', 'store_keeper'))");

        // ── distribution_items — location via distributions.to_location_id
        DB::statement('ALTER TABLE distribution_items ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE distribution_items FORCE ROW LEVEL SECURITY');
        DB::statement("
            CREATE POLICY distribution_items_select ON distribution_items FOR SELECT USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR EXISTS (
                    SELECT 1 FROM distributions d
                    WHERE d.id = distribution_items.distribution_id
                      AND d.to_location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                          COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
                )
            )");
        DB::statement("
            CREATE POLICY distribution_items_insert ON distribution_items FOR INSERT
            WITH CHECK (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
            )");

        // ── sale_items — location via sales.location_id ─────────────────
        DB::statement('ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE sale_items FORCE ROW LEVEL SECURITY');
        DB::statement("
            CREATE POLICY sale_items_select ON sale_items FOR SELECT USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR EXISTS (
                    SELECT 1 FROM sales s
                    WHERE s.id = sale_items.sale_id
                      AND s.location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                          COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
                )
            )");
        DB::statement("
            CREATE POLICY sale_items_insert ON sale_items FOR INSERT
            WITH CHECK (
                current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller')
            )");
        // Admin can attempt UPDATE — the immutability trigger enforces the actual block
        DB::statement("
            CREATE POLICY sale_items_update ON sale_items FOR UPDATE
            USING (current_setting('app.role', true) = 'admin')
        ");

        // ── news ───────────────────────────────────────────────────────
        DB::statement('ALTER TABLE news ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE news FORCE ROW LEVEL SECURITY');
        DB::statement("CREATE POLICY news_select ON news FOR SELECT
            USING (
                current_setting('app.role', true) = 'admin'
                OR (
                    current_setting('app.role', true) IN ('store_keeper', 'seller')
                    AND is_published = true
                )
            )");
        DB::statement("CREATE POLICY news_write ON news FOR ALL
            WITH CHECK (current_setting('app.role', true) = 'admin')");
    }

    public function down(): void
    {
        foreach (self::ALL_TABLES as $t) {
            DB::statement("DROP POLICY IF EXISTS {$t}_select ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_insert ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_update ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_delete ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_write ON {$t}");
            DB::statement("ALTER TABLE {$t} DISABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} NO FORCE ROW LEVEL SECURITY");
        }
        // Named policies on locations
        foreach (['loc_select', 'loc_insert', 'loc_update', 'loc_delete'] as $p) {
            DB::statement("DROP POLICY IF EXISTS {$p} ON locations");
        }
        // Named policies on categories, products, batches, news
        foreach (['cat_select', 'cat_write'] as $p) {
            DB::statement("DROP POLICY IF EXISTS {$p} ON categories");
        }
        foreach (['prod_select', 'prod_insert', 'prod_update', 'prod_delete'] as $p) {
            DB::statement("DROP POLICY IF EXISTS {$p} ON products");
        }
        foreach (['batch_select', 'batch_write'] as $p) {
            DB::statement("DROP POLICY IF EXISTS {$p} ON batches");
        }
        foreach (['news_select', 'news_write'] as $p) {
            DB::statement("DROP POLICY IF EXISTS {$p} ON news");
        }
    }
};
