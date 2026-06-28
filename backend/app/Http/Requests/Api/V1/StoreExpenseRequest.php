<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()->role, ['admin', 'store_keeper', 'seller']);
    }

    public function rules(): array
    {
        return [
            'category' => ['required', 'in:salary,security,electricity,cleanliness,rent,transport'],
            'amount' => ['required', 'numeric', 'min:0'],
            'expense_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
        ];
    }
}
