<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreReconciliationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'seller';
    }

    public function rules(): array
    {
        $locationId = $this->user()->location_id;

        return [
            'reconciliation_date' => [
                'required', 'date',
                Rule::unique('reconciliations')->where(fn ($q) => $q->where('location_id', $locationId)),
            ],
            'total_sold_amount' => ['required', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
