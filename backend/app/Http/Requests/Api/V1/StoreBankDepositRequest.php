<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBankDepositRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'location_id'    => ['required', 'integer', Rule::exists('locations', 'id')->where('type', 'shop')],
            'deposit_date'   => ['required', 'date', 'before_or_equal:today'],
            'channel'        => ['required', Rule::in(['cash', 'nmb', 'mobile', 'saloon'])],
            'slip_reference' => ['nullable', 'string', 'max:100'],
        ];
    }
}
