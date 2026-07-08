<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // DROP the existing CHECK constraint and re-add it with the new value.
        // Laravel's enum() on PostgreSQL produces a varchar(255) + CHECK constraint.
        DB::statement("ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check");
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (movement_type::text = ANY (ARRAY['purchase'::text,'distribution_out'::text,'distribution_in'::text,'distribution_revert'::text,'sale'::text,'sale_revert'::text,'adjustment'::text]))");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check");
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (movement_type::text = ANY (ARRAY['purchase'::text,'distribution_out'::text,'distribution_in'::text,'sale'::text,'sale_revert'::text,'adjustment'::text]))");
    }
};
