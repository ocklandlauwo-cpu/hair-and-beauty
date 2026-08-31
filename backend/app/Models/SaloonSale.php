<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaloonSale extends Model
{
    protected $fillable = ['location_id', 'provider_id', 'saloon_service_id', 'amount', 'sale_date', 'created_by'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'sale_date' => 'date',
        ];
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(Provider::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(SaloonService::class, 'saloon_service_id');
    }
}
