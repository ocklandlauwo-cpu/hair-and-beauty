<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // Add 'cancelled' to distributions.status CHECK constraint
        DB::statement("ALTER TABLE distributions DROP CONSTRAINT IF EXISTS distributions_status_check");
        DB::statement("ALTER TABLE distributions ADD CONSTRAINT distributions_status_check CHECK (status::text = ANY (ARRAY['pending'::text,'confirmed'::text,'discrepancy'::text,'cancelled'::text]))");

        // Add 'distribution_cancel' to stock_movements.movement_type CHECK constraint
        DB::statement("ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check");
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (movement_type::text = ANY (ARRAY['purchase'::text,'distribution_out'::text,'distribution_in'::text,'distribution_revert'::text,'distribution_cancel'::text,'sale'::text,'sale_revert'::text,'adjustment'::text]))");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE distributions DROP CONSTRAINT IF EXISTS distributions_status_check");
        DB::statement("ALTER TABLE distributions ADD CONSTRAINT distributions_status_check CHECK (status::text = ANY (ARRAY['pending'::text,'confirmed'::text,'discrepancy'::text]))");

        DB::statement("ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check");
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (movement_type::text = ANY (ARRAY['purchase'::text,'distribution_out'::text,'distribution_in'::text,'distribution_revert'::text,'sale'::text,'sale_revert'::text,'adjustment'::text]))");
    }
};
