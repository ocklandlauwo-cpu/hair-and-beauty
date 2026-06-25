<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->enum('type', ['store', 'shop']);
            $table->text('address')->nullable();
            $table->decimal('geofence_lat', 10, 8)->nullable();
            $table->decimal('geofence_lng', 11, 8)->nullable();
            $table->integer('geofence_radius_m')->default(100);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('locations');
    }
};
