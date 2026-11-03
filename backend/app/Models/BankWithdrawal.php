<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BankWithdrawal extends Model
{
    protected $fillable = ['amount', 'withdrawal_date', 'reason', 'recorded_by'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'withdrawal_date' => 'date',
        ];
    }
}
