<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:20', 'regex:/^\+?[0-9][0-9\s\-]{6,19}$/'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', 'in:admin,store_keeper,seller'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}
