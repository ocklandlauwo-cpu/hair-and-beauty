<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaloonService extends Model
{
    protected $fillable = ['name', 'uses_product', 'is_active'];

    protected function casts(): array
    {
        return ['uses_product' => 'boolean', 'is_active' => 'boolean'];
    }
}
