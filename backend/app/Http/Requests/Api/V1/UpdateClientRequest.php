<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class UpdateClientRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'name'        => ['sometimes', 'required', 'string', 'max:100'],
            'phone'       => ['sometimes', 'nullable', 'string', 'max:20'],
            'notes'       => ['sometimes', 'nullable', 'string'],
            'is_active'   => ['sometimes', 'boolean'],
            'location_id' => ['sometimes', 'required', 'integer', 'exists:locations,id'],
        ];
    }
}
