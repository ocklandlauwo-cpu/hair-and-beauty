<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDistributionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()->role, ['admin', 'store_keeper']);
    }

    public function rules(): array
    {
        return [
            'from_location_id' => [
                'nullable', 'integer', 'different:to_location_id',
                Rule::exists('locations', 'id')->where(
                    fn ($q) => $q->where('type', 'shop')->where('is_active', true)
                ),
            ],
            'to_location_id' => ['required', 'integer', 'exists:locations,id', 'different:from_location_id'],
            'distributed_at' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.batch_id' => ['nullable', 'integer', 'exists:batches,id'],
            'items.*.quantity_sent' => ['required', 'integer', 'min:1'],
        ];
    }
}
