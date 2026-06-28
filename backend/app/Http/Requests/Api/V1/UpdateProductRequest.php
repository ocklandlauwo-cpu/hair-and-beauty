<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->role === 'admin';
    }

    public function rules(): array
    {
        $productId = $this->route('product')?->id;

        return [
            'category_id' => ['sometimes', 'integer', 'exists:categories,id'],
            'name' => ['sometimes', 'string', 'max:200'],
            'sku' => ['nullable', 'string', 'max:50', "unique:products,sku,{$productId}"],
            'unit' => ['nullable', 'string', 'max:20'],
            'wholesale_threshold' => ['nullable', 'integer', 'min:1'],
            'wholesale_price' => ['sometimes', 'numeric', 'min:0'],
            'retail_price' => ['sometimes', 'numeric', 'min:0'],
            'image_path' => ['nullable', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}
