<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()->role, ['admin', 'seller']);
    }

    public function rules(): array
    {
        return [
            'payment_method' => ['required', 'in:nmb,airtel,vodacom,tigo'],
            'sale_date' => ['required', 'date'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.batch_id' => ['nullable', 'integer', 'exists:batches,id'],
        ];
    }
}
