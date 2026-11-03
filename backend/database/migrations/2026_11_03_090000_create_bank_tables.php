<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        // One verified cash deposit per shop per day; amount is snapshotted at verification
        Schema::create('bank_deposits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('location_id')->constrained()->restrictOnDelete();
            $table->date('deposit_date');
            $table->decimal('amount', 12, 2);
            $table->string('slip_reference', 100)->nullable();
            $table->foreignId('verified_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('verified_at');
            $table->timestamps();
            $table->unique(['location_id', 'deposit_date']);
        });

        Schema::create('bank_withdrawals', function (Blueprint $table) {
            $table->id();
            $table->decimal('amount', 12, 2);
            $table->date('withdrawal_date');
            $table->string('reason', 255);
            $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_withdrawals');
        Schema::dropIfExists('bank_deposits');
    }
};
