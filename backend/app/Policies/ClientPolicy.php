<?php

namespace App\Policies;

use App\Models\User;

class ClientPolicy
{
    public function viewAny(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function create(User $user): bool
    {
        return in_array($user->role, ['admin', 'seller']);
    }

    public function update(User $user): bool
    {
        return in_array($user->role, ['admin', 'seller']);
    }
}
