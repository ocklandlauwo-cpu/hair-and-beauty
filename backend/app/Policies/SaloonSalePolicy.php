<?php

namespace App\Policies;

use App\Models\User;

class SaloonSalePolicy
{
    public function viewAny(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function create(User $user): bool
    {
        return in_array($user->role, ['admin', 'seller']);
    }
}
