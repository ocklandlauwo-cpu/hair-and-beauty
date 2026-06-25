<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // Function: update products.latest_cost when a purchase_item is inserted
        DB::statement('
            CREATE OR REPLACE FUNCTION fn_update_product_latest_cost()
            RETURNS TRIGGER AS $$
            BEGIN
                UPDATE products SET latest_cost = NEW.unit_cost WHERE id = NEW.product_id;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        ');

        DB::statement('
            CREATE TRIGGER trg_update_latest_cost
            AFTER INSERT ON purchase_items
            FOR EACH ROW EXECUTE FUNCTION fn_update_product_latest_cost();
        ');

        // Function: block UPDATE and DELETE on immutable ledger tables
        DB::statement("
            CREATE OR REPLACE FUNCTION fn_prevent_immutable_update()
            RETURNS TRIGGER AS \$\$
            BEGIN
                RAISE EXCEPTION 'This table is an immutable ledger — UPDATE and DELETE are not permitted';
            END;
            \$\$ LANGUAGE plpgsql;
        ");

        DB::statement('
            CREATE TRIGGER trg_stock_movements_immutable
            BEFORE UPDATE OR DELETE ON stock_movements
            FOR EACH ROW EXECUTE FUNCTION fn_prevent_immutable_update();
        ');

        // Function: get current stock balance for a product at a location
        DB::statement('
            CREATE OR REPLACE FUNCTION fn_get_stock(p_product_id BIGINT, p_location_id BIGINT)
            RETURNS INTEGER AS $$
                SELECT COALESCE(SUM(quantity), 0)::INTEGER
                FROM stock_movements
                WHERE product_id = p_product_id
                  AND location_id = p_location_id;
            $$ LANGUAGE sql STABLE;
        ');
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON stock_movements');
        DB::statement('DROP TRIGGER IF EXISTS trg_update_latest_cost ON purchase_items');
        DB::statement('DROP FUNCTION IF EXISTS fn_prevent_immutable_update()');
        DB::statement('DROP FUNCTION IF EXISTS fn_update_product_latest_cost()');
        DB::statement('DROP FUNCTION IF EXISTS fn_get_stock(BIGINT, BIGINT)');
    }
};
