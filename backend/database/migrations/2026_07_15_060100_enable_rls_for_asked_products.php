<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        DB::statement('ALTER TABLE asked_products ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE asked_products FORCE ROW LEVEL SECURITY');

        DB::statement("
            CREATE POLICY asked_products_select ON asked_products FOR SELECT USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )
        ");

        DB::statement("
            CREATE POLICY asked_products_insert ON asked_products FOR INSERT WITH CHECK (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )
        ");

        DB::statement("
            CREATE POLICY asked_products_update ON asked_products FOR UPDATE USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                    COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
            )
        ");

        DB::statement("
            CREATE POLICY asked_products_delete ON asked_products FOR DELETE USING (
                current_setting('app.role', true) = 'admin'
            )
        ");
    }

    public function down(): void
    {
        DB::statement('DROP POLICY IF EXISTS asked_products_select ON asked_products');
        DB::statement('DROP POLICY IF EXISTS asked_products_insert ON asked_products');
        DB::statement('DROP POLICY IF EXISTS asked_products_update ON asked_products');
        DB::statement('DROP POLICY IF EXISTS asked_products_delete ON asked_products');
    }
};
