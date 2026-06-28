<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'category_id', 'name', 'sku', 'unit',
        'wholesale_threshold', 'wholesale_price', 'retail_price',
        'latest_cost', 'image_path', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'wholesale_threshold' => 'integer',
            'wholesale_price' => 'decimal:2',
            'retail_price' => 'decimal:2',
            'latest_cost' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    /** @return BelongsTo<Category, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }

    public function priceTierFor(int $quantity): string
    {
        return $quantity >= $this->wholesale_threshold ? 'wholesale' : 'retail';
    }

    public function priceFor(int $quantity): float|string
    {
        return $this->priceTierFor($quantity) === 'wholesale'
            ? $this->wholesale_price
            : $this->retail_price;
    }
}
