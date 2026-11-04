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
        // Services flagged here show an optional product + quantity on the log form (no stock effect)
        Schema::table('saloon_services', function (Blueprint $table) {
            $table->boolean('uses_product')->default(false)->after('name');
        });
        DB::statement("UPDATE saloon_services SET uses_product = true WHERE UPPER(TRIM(name)) = 'KUSUKA NYWELE'");

        Schema::table('saloon_sales', function (Blueprint $table) {
            $table->foreignId('product_id')->nullable()->after('saloon_service_id')->constrained()->nullOnDelete();
            $table->integer('product_quantity')->nullable()->after('product_id');
        });
    }

    public function down(): void
    {
        Schema::table('saloon_sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_id');
            $table->dropColumn('product_quantity');
        });
        Schema::table('saloon_services', function (Blueprint $table) {
            $table->dropColumn('uses_product');
        });
    }
};
