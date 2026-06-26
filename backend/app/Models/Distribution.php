<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Distribution extends Model
{
    protected $fillable = [
        'from_location_id', 'to_location_id', 'distributed_by',
        'confirmed_by', 'status', 'distributed_at', 'confirmed_at', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'distributed_at' => 'datetime',
            'confirmed_at' => 'datetime',
        ];
    }

    public function fromLocation(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'from_location_id');
    }

    public function toLocation(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'to_location_id');
    }

    /** @return HasMany<DistributionItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(DistributionItem::class);
    }
}
