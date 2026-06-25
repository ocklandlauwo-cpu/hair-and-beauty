<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreign('location_id')
                ->references('id')
                ->on('locations')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['location_id']);
        });
    }
};
