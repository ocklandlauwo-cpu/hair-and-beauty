<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSaloonToolRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'location_id'   => ['required', 'integer', Rule::exists('locations', 'id')->where('type', 'shop')],
            'name'          => ['required', 'string', 'max:150'],
            'quantity'      => ['required', 'integer', 'min:1'],
            'unit_cost'     => ['required', 'numeric', 'min:0'],
            'purchase_date' => ['required', 'date'],
        ];
    }
}
