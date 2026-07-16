<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreAskedProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()->role, ['admin', 'store_keeper', 'seller']);
    }

    public function rules(): array
    {
        $requiresLocation = in_array($this->user()?->role, ['admin', 'store_keeper']);

        return [
            'product_name' => ['required', 'string', 'max:200'],
            'location_id'  => $requiresLocation
                ? ['required', 'integer', 'exists:locations,id']
                : ['nullable', 'integer'],
        ];
    }
}
