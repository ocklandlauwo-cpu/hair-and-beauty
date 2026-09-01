<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSaloonSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()->role, ['admin', 'seller']);
    }

    public function rules(): array
    {
        $isAdmin = $this->user()?->role === 'admin';

        return [
            'location_id'       => $isAdmin
                ? ['required', 'integer', Rule::exists('locations', 'id')->where('type', 'shop')]
                : ['nullable', 'integer'],
            'provider_id'       => ['required', 'integer', 'exists:providers,id'],
            'saloon_service_id' => ['required', 'integer', 'exists:saloon_services,id'],
            'amount'            => ['required', 'numeric', 'min:0.01'],
            'sale_date'         => ['required', 'date'],
        ];
    }
}
