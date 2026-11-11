<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // Saloon Center sales are verified as their own channel (they carry no payment method)
        DB::statement('ALTER TABLE bank_deposits DROP CONSTRAINT IF EXISTS bank_deposits_channel_check');
        DB::statement("ALTER TABLE bank_deposits ADD CONSTRAINT bank_deposits_channel_check CHECK (channel IN ('cash', 'nmb', 'mobile', 'saloon'))");
    }

    public function down(): void
    {
        DB::statement("DELETE FROM bank_deposits WHERE channel = 'saloon'");
        DB::statement('ALTER TABLE bank_deposits DROP CONSTRAINT IF EXISTS bank_deposits_channel_check');
        DB::statement("ALTER TABLE bank_deposits ADD CONSTRAINT bank_deposits_channel_check CHECK (channel IN ('cash', 'nmb', 'mobile'))");
    }
};
