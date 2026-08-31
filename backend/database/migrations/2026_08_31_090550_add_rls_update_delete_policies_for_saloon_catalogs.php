<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // {$t}_write (FOR ALL WITH CHECK) only covers INSERT with CHECK.
        // For UPDATE and DELETE the USING clause needs to be explicit.
        foreach (['providers', 'saloon_services'] as $t) {
            DB::statement("CREATE POLICY {$t}_update ON {$t} FOR UPDATE
                USING (current_setting('app.role', true) = 'admin')
                WITH CHECK (current_setting('app.role', true) = 'admin')");

            DB::statement("CREATE POLICY {$t}_delete ON {$t} FOR DELETE
                USING (current_setting('app.role', true) = 'admin')");
        }
    }

    public function down(): void
    {
        foreach (['providers', 'saloon_services'] as $t) {
            DB::statement("DROP POLICY IF EXISTS {$t}_update ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_delete ON {$t}");
        }
    }
};
