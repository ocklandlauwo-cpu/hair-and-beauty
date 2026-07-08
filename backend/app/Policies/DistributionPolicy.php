<?php

namespace App\Policies;

use App\Models\Distribution;
use App\Models\User;

class DistributionPolicy
{
    public function viewAny(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper', 'seller']);
    }

    public function create(User $user): bool
    {
        return in_array($user->role, ['admin', 'store_keeper']);
    }

    public function confirm(User $user, Distribution $distribution): bool
    {
        return $user->role === 'seller'
            && $distribution->status === 'pending'
            && $distribution->to_location_id === $user->location_id;
    }

    public function revert(User $user, Distribution $distribution): bool
    {
        return in_array($user->role, ['admin', 'store_keeper'])
            && in_array($distribution->status, ['confirmed', 'discrepancy']);
    }

    public function cancel(User $user, Distribution $distribution): bool
    {
        return in_array($user->role, ['admin', 'store_keeper'])
            && $distribution->status === 'pending';
    }
}
