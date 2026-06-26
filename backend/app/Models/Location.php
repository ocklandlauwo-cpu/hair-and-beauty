<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Location extends Model
{
    protected $fillable = ['name', 'type', 'address', 'geofence_lat', 'geofence_lng', 'geofence_radius_m', 'is_active'];

    protected function casts(): array
    {
        return [
            'geofence_lat' => 'decimal:8',
            'geofence_lng' => 'decimal:8',
            'geofence_radius_m' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
