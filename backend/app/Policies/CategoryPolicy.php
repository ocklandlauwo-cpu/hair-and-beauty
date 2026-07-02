<?php

namespace App\Policies;

use App\Models\User;

class CategoryPolicy
{
    public function create(User $user): bool
    {
        return $user->role === 'admin';
    }

    public function update(User $user): bool
    {
        return $user->role === 'admin';
    }
}
