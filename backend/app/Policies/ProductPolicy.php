<?php

namespace App\Policies;

use App\Models\User;

class ProductPolicy
{
    public function viewAny(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function view(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function create(User $user): bool
    {
        return $user->role === 'admin';
    }

    public function update(User $user): bool
    {
        return $user->role === 'admin';
    }

    public function delete(User $user): bool
    {
        return $user->role === 'admin';
    }

    public function manageBatches(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper']);
    }
}
