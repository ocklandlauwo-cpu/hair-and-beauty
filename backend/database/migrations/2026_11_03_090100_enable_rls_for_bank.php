<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // ── bank_deposits, bank_withdrawals — admin only, end to end
        foreach (['bank_deposits', 'bank_withdrawals'] as $t) {
            DB::statement("ALTER TABLE {$t} ENABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} FORCE ROW LEVEL SECURITY");
            DB::statement("CREATE POLICY {$t}_select ON {$t} FOR SELECT
                USING (current_setting('app.role', true) = 'admin')");
            DB::statement("CREATE POLICY {$t}_insert ON {$t} FOR INSERT
                WITH CHECK (current_setting('app.role', true) = 'admin')");
        }

        // Unverifying a deposit deletes it
        DB::statement("CREATE POLICY bank_deposits_delete ON bank_deposits FOR DELETE
            USING (current_setting('app.role', true) = 'admin')");
    }

    public function down(): void
    {
        DB::statement('DROP POLICY IF EXISTS bank_deposits_delete ON bank_deposits');
        foreach (['bank_deposits', 'bank_withdrawals'] as $t) {
            DB::statement("DROP POLICY IF EXISTS {$t}_select ON {$t}");
            DB::statement("DROP POLICY IF EXISTS {$t}_insert ON {$t}");
            DB::statement("ALTER TABLE {$t} DISABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} NO FORCE ROW LEVEL SECURITY");
        }
    }
};
