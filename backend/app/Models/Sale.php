<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    protected $fillable = [
        'location_id', 'sold_by', 'client_id', 'payment_method',
        'total_amount', 'discount_amount', 'is_reverted',
        'reverted_by', 'reverted_at', 'revert_reason', 'sale_date',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'is_reverted' => 'boolean',
            'reverted_at' => 'datetime',
            'sale_date' => 'date',
        ];
    }

    /** @return HasMany<SaleItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }
}
