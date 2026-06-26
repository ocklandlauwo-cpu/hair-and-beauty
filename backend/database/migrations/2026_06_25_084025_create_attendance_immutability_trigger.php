<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // fn_prevent_immutable_update() already created in Task 3
        DB::statement('
            CREATE TRIGGER trg_attendance_immutable
            BEFORE UPDATE OR DELETE ON attendance
            FOR EACH ROW EXECUTE FUNCTION fn_prevent_immutable_update();
        ');
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS trg_attendance_immutable ON attendance');
    }
};
