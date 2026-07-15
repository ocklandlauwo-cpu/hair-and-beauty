<?php

namespace App\Policies;

use App\Models\AskedProduct;
use App\Models\User;

class AskedProductPolicy
{
    public function viewAny(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function create(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function update(User $user, AskedProduct $askedProduct): bool
    {
        return in_array($user->role, ['admin', 'store_keeper'])
            || ($user->role === 'seller' && $askedProduct->location_id === $user->location_id);
    }

    public function delete(User $user): bool
    {
        return $user->role === 'admin';
    }
}
