<?php

namespace App\Policies;

use App\Models\User;

class UserManagementPolicy
{
    public function before(User $user): ?bool
    {
        return $user->role === 'admin' ? true : false;
    }

    public function viewAny(User $user): bool
    {
        return false; // handled by before()
    }

    public function create(User $user): bool
    {
        return false; // handled by before()
    }

    public function update(User $user, User $target): bool
    {
        return false; // handled by before()
    }
}
