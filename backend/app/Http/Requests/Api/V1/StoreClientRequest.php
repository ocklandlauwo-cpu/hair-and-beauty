<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreClientRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()->role, ['admin', 'seller']);
    }

    public function rules(): array
    {
        $isAdmin = $this->user()?->role === 'admin';

        return [
            'name'        => ['required', 'string', 'max:100'],
            'phone'       => ['nullable', 'string', 'max:20'],
            'notes'       => ['nullable', 'string'],
            'location_id' => $isAdmin
                ? ['required', 'integer', 'exists:locations,id']
                : ['nullable', 'integer'],
        ];
    }
}
