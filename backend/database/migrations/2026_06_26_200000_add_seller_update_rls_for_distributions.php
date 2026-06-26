<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // Allow sellers to UPDATE distributions sent to their location (needed for confirm workflow).
        DB::statement('DROP POLICY IF EXISTS distributions_update ON distributions');
        DB::statement("
            CREATE POLICY distributions_update ON distributions FOR UPDATE
            USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR (
                    current_setting('app.role', true) = 'seller'
                    AND to_location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                        COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
                )
            )");

        // Allow sellers to UPDATE distribution_items belonging to distributions sent to their location.
        DB::statement("
            CREATE POLICY distribution_items_update ON distribution_items FOR UPDATE
            USING (
                current_setting('app.role', true) IN ('admin', 'store_keeper')
                OR (
                    current_setting('app.role', true) = 'seller'
                    AND EXISTS (
                        SELECT 1 FROM distributions d
                        WHERE d.id = distribution_items.distribution_id
                          AND d.to_location_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(
                              COALESCE(NULLIF(current_setting('app.location_ids', true), ''), '[]')::jsonb)))
                    )
                )
            )");
    }

    public function down(): void
    {
        DB::statement('DROP POLICY IF EXISTS distributions_update ON distributions');
        DB::statement('DROP POLICY IF EXISTS distribution_items_update ON distribution_items');

        // Restore the original admin/store_keeper-only update policy.
        DB::statement("CREATE POLICY distributions_update ON distributions FOR UPDATE
            USING (current_setting('app.role', true) IN ('admin', 'store_keeper'))");
    }
};
