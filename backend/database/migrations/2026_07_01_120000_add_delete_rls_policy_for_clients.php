<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::connection('pgsql_owner')->statement(
            "CREATE POLICY clients_delete ON clients
             FOR DELETE
             USING (current_setting('app.role', true) = 'admin')"
        );
    }

    public function down(): void
    {
        DB::connection('pgsql_owner')->statement('DROP POLICY IF EXISTS clients_delete ON clients');
    }
};
