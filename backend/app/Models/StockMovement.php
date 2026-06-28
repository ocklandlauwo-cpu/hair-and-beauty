<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    public $timestamps = false; // immutable: only created_at, set by DB default

    protected $fillable = [
        'product_id', 'location_id', 'movement_type', 'quantity',
        'reference_type', 'reference_id', 'batch_id', 'unit_cost',
        'performed_by', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_cost' => 'decimal:2',
        ];
    }
}
