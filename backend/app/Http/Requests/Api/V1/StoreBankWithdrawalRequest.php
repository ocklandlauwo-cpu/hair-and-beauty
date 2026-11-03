<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreBankWithdrawalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        return [
            'amount'          => ['required', 'numeric', 'min:0.01'],
            'withdrawal_date' => ['required', 'date', 'before_or_equal:today'],
            'reason'          => ['required', 'string', 'max:255'],
        ];
    }
}
