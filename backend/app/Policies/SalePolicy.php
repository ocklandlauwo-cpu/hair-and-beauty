<?php

namespace App\Policies;

use App\Models\Sale;
use App\Models\User;

class SalePolicy
{
    public function viewAny(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function create(User $user): bool
    {
        return in_array($user->role, ['admin', 'seller']);
    }

    public function revert(User $user, Sale $sale): bool
    {
        return $user->role === 'admin' && ! $sale->is_reverted;
    }
}
