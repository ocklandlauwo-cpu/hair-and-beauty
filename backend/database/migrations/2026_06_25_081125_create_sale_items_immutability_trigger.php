<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // fn_prevent_immutable_update() is already defined in Task 3's migration
        DB::statement('
            CREATE TRIGGER trg_sale_items_immutable
            BEFORE UPDATE OR DELETE ON sale_items
            FOR EACH ROW EXECUTE FUNCTION fn_prevent_immutable_update();
        ');
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS trg_sale_items_immutable ON sale_items');
    }
};
