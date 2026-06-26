<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'pgsql_owner';

    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('location_id')->constrained()->restrictOnDelete();
            $table->enum('movement_type', [
                'purchase',
                'distribution_out',
                'distribution_in',
                'sale',
                'sale_revert',
                'adjustment',
            ]);
            $table->integer('quantity'); // positive = in, negative = out
            $table->string('reference_type', 50);
            $table->unsignedBigInteger('reference_id');
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('unit_cost', 12, 2)->default(0);
            $table->foreignId('performed_by')->constrained('users')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->useCurrent();
            // No updated_at — immutable ledger
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
