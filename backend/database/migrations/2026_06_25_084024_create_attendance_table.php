<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        Schema::create('attendance', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('location_id')->constrained()->restrictOnDelete();
            $table->enum('action', ['clock_in', 'clock_out']);
            $table->decimal('latitude', 10, 8);
            $table->decimal('longitude', 11, 8);
            $table->boolean('is_within_geofence');
            $table->timestampTz('recorded_at');
            $table->timestamp('created_at')->useCurrent();
            // No updated_at — immutable log
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance');
    }
};
