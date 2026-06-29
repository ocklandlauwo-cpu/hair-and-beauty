<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UatProductSeeder extends Seeder
{
    private array $hairProducts = [
        'Shea Butter 250ml', 'Coconut Oil 500ml', 'Argan Oil 100ml', 'Hair Relaxer Kit',
        'Deep Conditioner 400g', 'Leave-In Conditioner 300ml', 'Hair Growth Oil 200ml',
        'Anti-Dandruff Shampoo 400ml', 'Moisturizing Shampoo 400ml', 'Heat Protectant Spray',
        'Hair Gel Strong 250g', 'Hair Wax 150g', 'Edge Control 100g', 'Braiding Gel 500g',
        'Hair Dye Black', 'Hair Dye Brown', 'Hair Dye Blonde', 'Bleaching Powder 500g',
        'Developer 20 Volume', 'Developer 30 Volume',
    ];

    private array $cosmeticsProducts = [
        'Face Cream SPF 30', 'Brightening Serum 30ml', 'Vitamin C Cream 50g',
        'Body Lotion 500ml', 'Whitening Lotion 400ml', 'Hand Cream 100ml',
        'Lip Gloss Pink', 'Lip Gloss Red', 'Lip Gloss Nude',
        'Foundation Light', 'Foundation Medium', 'Foundation Dark',
        'Mascara Black', 'Eyeliner Pencil', 'Eyeshadow Palette',
        'Blush Peach', 'Blush Rose', 'Powder Compact', 'Primer Spray', 'Setting Spray',
    ];

    public function run(): void
    {
        $catHair = DB::table('categories')->where('name', 'Hair')->value('id');
        $catCos = DB::table('categories')->where('name', 'Cosmetics')->value('id');
        $now = now();

        // 100 Hair products
        for ($i = 0; $i < 100; $i++) {
            $base = $this->hairProducts[$i % count($this->hairProducts)];
            $name = $base.' #'.($i + 1);
            $cost = rand(2000, 15000);
            $retail = (int) ($cost * 1.5);
            $wholesale = (int) ($cost * 1.25);
            $prodId = DB::table('products')->insertGetId([
                'category_id' => $catHair,
                'name' => $name,
                'sku' => 'HAIR-'.str_pad($i + 1, 4, '0', STR_PAD_LEFT),
                'unit' => 'piece',
                'wholesale_threshold' => 12,
                'wholesale_price' => $wholesale,
                'retail_price' => $retail,
                'latest_cost' => $cost,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            // Add batch with staggered expiry dates
            if ($i % 3 === 0) {
                DB::table('batches')->insert([
                    'product_id' => $prodId,
                    'batch_number' => 'H'.date('Ym').str_pad($i, 3, '0', STR_PAD_LEFT),
                    'expiry_date' => now()->addDays(rand(-10, 365))->toDateString(),
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        // 100 Cosmetics products
        for ($i = 0; $i < 100; $i++) {
            $base = $this->cosmeticsProducts[$i % count($this->cosmeticsProducts)];
            $name = $base.' #'.($i + 1);
            $cost = rand(3000, 20000);
            $retail = (int) ($cost * 1.6);
            $wholesale = (int) ($cost * 1.3);
            DB::table('products')->insertGetId([
                'category_id' => $catCos,
                'name' => $name,
                'sku' => 'COS-'.str_pad($i + 1, 4, '0', STR_PAD_LEFT),
                'unit' => 'piece',
                'wholesale_threshold' => 12,
                'wholesale_price' => $wholesale,
                'retail_price' => $retail,
                'latest_cost' => $cost,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
}
