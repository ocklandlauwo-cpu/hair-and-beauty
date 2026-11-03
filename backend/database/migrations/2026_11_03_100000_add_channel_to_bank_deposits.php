<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // Deposits are now verified per payment channel; existing rows were cash deposits
        Schema::table('bank_deposits', function (Blueprint $table) {
            $table->string('channel', 10)->default('cash')->after('deposit_date');
            $table->dropUnique(['location_id', 'deposit_date']);
            $table->unique(['location_id', 'deposit_date', 'channel']);
        });
        DB::statement("ALTER TABLE bank_deposits ADD CONSTRAINT bank_deposits_channel_check CHECK (channel IN ('cash', 'nmb', 'mobile'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE bank_deposits DROP CONSTRAINT IF EXISTS bank_deposits_channel_check');
        Schema::table('bank_deposits', function (Blueprint $table) {
            $table->dropUnique(['location_id', 'deposit_date', 'channel']);
            $table->dropColumn('channel');
            $table->unique(['location_id', 'deposit_date']);
        });
    }
};
