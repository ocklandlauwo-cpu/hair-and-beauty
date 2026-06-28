<?php

namespace App\Policies;

use App\Models\User;

class PurchasePolicy
{
    public function viewAny(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper']);
    }

    public function view(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper']);
    }

    public function create(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper']);
    }
}
