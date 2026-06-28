<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class ConfirmDistributionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'seller';
    }

    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1'],
            'items.*.distribution_item_id' => ['required', 'integer', 'exists:distribution_items,id'],
            'items.*.quantity_received' => ['required', 'integer', 'min:0'],
        ];
    }
}
