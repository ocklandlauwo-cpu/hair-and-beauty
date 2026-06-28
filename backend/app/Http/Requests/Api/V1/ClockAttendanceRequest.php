<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class ClockAttendanceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()->role, ['admin', 'store_keeper', 'seller']);
    }

    public function rules(): array
    {
        return [
            'action' => ['required', 'in:clock_in,clock_out'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'recorded_at' => ['nullable', 'date'],
        ];
    }
}
