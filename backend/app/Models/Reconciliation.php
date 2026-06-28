<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Reconciliation extends Model
{
    protected $fillable = [
        'location_id', 'seller_id', 'reconciliation_date',
        'total_sold_amount', 'receipt_path', 'notes',
        'verified_by', 'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'reconciliation_date' => 'date',
            'total_sold_amount' => 'decimal:2',
            'verified_at' => 'datetime',
        ];
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_id');
    }
}
