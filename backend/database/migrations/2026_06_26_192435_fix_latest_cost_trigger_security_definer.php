<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // Recreate the latest-cost trigger function as SECURITY DEFINER so it
        // can UPDATE products.latest_cost regardless of the calling user's
        // app.role GUC (which drives row-level security policies).
        // The function temporarily elevates app.role = 'admin' locally (scoped
        // to the function execution via set_config(…, true)) so the RLS
        // prod_update policy allows the UPDATE, then restores the original value.
        DB::statement('
            CREATE OR REPLACE FUNCTION fn_update_product_latest_cost()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $$
            DECLARE
                v_prev_role text;
            BEGIN
                -- Save and temporarily elevate role for the products UPDATE
                v_prev_role := current_setting(\'app.role\', true);
                PERFORM set_config(\'app.role\', \'admin\', true);

                UPDATE products SET latest_cost = NEW.unit_cost WHERE id = NEW.product_id;

                -- Restore previous role (set_config with is_local=true is already
                -- transaction-local, but this makes intent explicit)
                PERFORM set_config(\'app.role\', COALESCE(NULLIF(v_prev_role, \'\'), \'guest\'), true);

                RETURN NEW;
            END;
            $$;
        ');
    }

    public function down(): void
    {
        // Revert to the original non-SECURITY DEFINER version
        DB::statement('
            CREATE OR REPLACE FUNCTION fn_update_product_latest_cost()
            RETURNS TRIGGER AS $$
            BEGIN
                UPDATE products SET latest_cost = NEW.unit_cost WHERE id = NEW.product_id;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        ');
    }
};
