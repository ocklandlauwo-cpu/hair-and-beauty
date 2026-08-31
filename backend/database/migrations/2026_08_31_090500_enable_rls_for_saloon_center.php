<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // ── providers, saloon_services — catalog tables (same pattern as categories)
        foreach (['providers', 'saloon_services'] as $t) {
            DB::statement("ALTER TABLE {$t} ENABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} FORCE ROW LEVEL SECURITY");
            DB::statement("CREATE POLICY {$t}_select ON {$t} FOR SELECT
                USING (current_setting('app.role', true) IN ('admin', 'store_keeper', 'seller'))");
            DB::statement("CREATE POLICY {$t}_write ON {$t} FOR ALL
                WITH CHECK (current_setting('app.role', true) = 'admin')");
        }

        // ── saloon_sales — location-scoped (seller sees own location only)
        DB::statement('ALTER TABLE saloon_sales ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE saloon_sales FORCE ROW LEVEL SECURITY');
        DB::statement("
            CREATE POLICY saloon_sales_select ON saloon_sales FOR SELECT USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )");
        DB::statement("
            CREATE POLICY saloon_sales_insert ON saloon_sales FOR INSERT WITH CHECK (
                current_setting('app.role', true) = 'admin'
                OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )");

        // ── saloon_tools — admin only, end to end
        DB::statement('ALTER TABLE saloon_tools ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE saloon_tools FORCE ROW LEVEL SECURITY');
        DB::statement("CREATE POLICY saloon_tools_select ON saloon_tools FOR SELECT
            USING (current_setting('app.role', true) = 'admin')");
        DB::statement("CREATE POLICY saloon_tools_insert ON saloon_tools FOR INSERT
            WITH CHECK (current_setting('app.role', true) = 'admin')");
    }

    public function down(): void
    {
        foreach (['providers', 'saloon_services'] as $t) {
            DB::statement("DROP POLICY IF EXISTS {$t}_select ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_write ON {$t}");
            DB::statement("ALTER TABLE {$t} DISABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} NO FORCE ROW LEVEL SECURITY");
        }
        foreach (['saloon_sales', 'saloon_tools'] as $t) {
            DB::statement("DROP POLICY IF EXISTS {$t}_select ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_insert ON {$t}");
            DB::statement("ALTER TABLE {$t} DISABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} NO FORCE ROW LEVEL SECURITY");
        }
    }
};
