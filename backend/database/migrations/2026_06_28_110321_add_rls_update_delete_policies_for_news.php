<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // news_write (FOR ALL WITH CHECK) only covers INSERT with CHECK.
        // For UPDATE and DELETE the USING clause needs to be explicit.
        DB::statement("CREATE POLICY news_update ON news FOR UPDATE
            USING (current_setting('app.role', true) = 'admin')
            WITH CHECK (current_setting('app.role', true) = 'admin')");

        DB::statement("CREATE POLICY news_delete ON news FOR DELETE
            USING (current_setting('app.role', true) = 'admin')");
    }

    public function down(): void
    {
        DB::statement('DROP POLICY IF EXISTS news_update ON news');
        DB::statement('DROP POLICY IF EXISTS news_delete ON news');
    }
};
