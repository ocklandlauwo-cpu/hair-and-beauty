<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BankDeposit extends Model
{
    /** Payment-method groups that make up each deposit channel. */
    public const CHANNEL_METHODS = [
        'cash'   => ['cash'],
        'nmb'    => ['nmb'],
        'mobile' => ['airtel', 'vodacom', 'tigo'],
    ];

    protected $fillable = ['location_id', 'deposit_date', 'channel', 'amount', 'slip_reference', 'verified_by', 'verified_at'];

    protected function casts(): array
    {
        return [
            'deposit_date' => 'date',
            'amount' => 'decimal:2',
            'verified_at' => 'datetime',
        ];
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
