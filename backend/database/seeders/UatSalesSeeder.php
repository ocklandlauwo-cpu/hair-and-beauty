<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UatSalesSeeder extends Seeder
{
    public function run(): void
    {
        $storeId = DB::table('locations')->where('type', 'store')->value('id');
        $shopIds = DB::table('locations')->where('type', 'shop')->pluck('id')->toArray();
        $storeKeeper = DB::table('users')->where('role', 'store_keeper')->value('id');
        $products = DB::table('products')->select('id', 'retail_price', 'wholesale_price', 'latest_cost')->get();
        $paymentMethods = ['nmb', 'airtel', 'vodacom', 'tigo'];

        // ── Purchases (30 over 90 days, stock at store) ─────────────────
        for ($day = 89; $day >= 0; $day -= 3) {
            $purchaseDate = now()->subDays($day)->toDateString();
            $purchaseId = DB::table('purchases')->insertGetId([
                'purchased_by' => $storeKeeper,
                'supplier_name' => 'ABC Wholesalers',
                'purchase_date' => $purchaseDate,
                'created_at' => now()->subDays($day),
                'updated_at' => now()->subDays($day),
            ]);

            // 10 random products per purchase
            $sample = $products->random(10);
            foreach ($sample as $product) {
                $qty = rand(20, 60);
                $cost = (int) $product->latest_cost;
                DB::table('purchase_items')->insert([
                    'purchase_id' => $purchaseId,
                    'product_id' => $product->id,
                    'quantity' => $qty,
                    'unit_cost' => $cost,
                    'created_at' => now()->subDays($day),
                    'updated_at' => now()->subDays($day),
                ]);
                DB::table('stock_movements')->insert([
                    'product_id' => $product->id,
                    'location_id' => $storeId,
                    'movement_type' => 'purchase',
                    'quantity' => $qty,
                    'reference_type' => 'purchase',
                    'reference_id' => $purchaseId,
                    'unit_cost' => $cost,
                    'performed_by' => $storeKeeper,
                    'created_at' => now()->subDays($day),
                ]);
            }
        }

        // ── Distributions (to each shop every week) ──────────────────────
        foreach ($shopIds as $shopIdx => $shopId) {
            $sellerUser = DB::table('users')->where('role', 'seller')->where('location_id', $shopId)->value('id');
            if (! $sellerUser) {
                continue;
            }
            for ($week = 12; $week >= 0; $week--) {
                $distDate = now()->subWeeks($week)->startOfWeek();
                $distId = DB::table('distributions')->insertGetId([
                    'from_location_id' => $storeId,
                    'to_location_id' => $shopId,
                    'distributed_by' => $storeKeeper,
                    'confirmed_by' => $sellerUser,
                    'status' => 'confirmed',
                    'distributed_at' => $distDate,
                    'confirmed_at' => $distDate->copy()->addHours(2),
                    'created_at' => $distDate,
                    'updated_at' => $distDate->copy()->addHours(2),
                ]);

                $sample = $products->random(8);
                foreach ($sample as $product) {
                    $qty = rand(10, 30);
                    DB::table('distribution_items')->insert([
                        'distribution_id' => $distId,
                        'product_id' => $product->id,
                        'quantity_sent' => $qty,
                        'quantity_received' => $qty,
                        'created_at' => $distDate,
                        'updated_at' => $distDate,
                    ]);
                    // Out from store
                    DB::table('stock_movements')->insert([
                        'product_id' => $product->id,
                        'location_id' => $storeId,
                        'movement_type' => 'distribution_out',
                        'quantity' => -$qty,
                        'reference_type' => 'distribution',
                        'reference_id' => $distId,
                        'unit_cost' => 0,
                        'performed_by' => $storeKeeper,
                        'created_at' => $distDate,
                    ]);
                    // In to shop
                    DB::table('stock_movements')->insert([
                        'product_id' => $product->id,
                        'location_id' => $shopId,
                        'movement_type' => 'distribution_in',
                        'quantity' => $qty,
                        'reference_type' => 'distribution',
                        'reference_id' => $distId,
                        'unit_cost' => 0,
                        'performed_by' => $sellerUser,
                        'created_at' => $distDate->copy()->addHours(2),
                    ]);
                }
            }

            // ── Daily sales per shop (last 90 days) ──────────────────────
            for ($day = 89; $day >= 0; $day--) {
                $saleDate = now()->subDays($day)->toDateString();
                // 3–8 sales per day per shop
                $saleCount = rand(3, 8);
                for ($s = 0; $s < $saleCount; $s++) {
                    $product = $products->random();
                    $qty = rand(1, 20); // allows wholesale (>=12) sales to occur
                    $isBulk = $qty >= 12;
                    $price = $isBulk ? $product->wholesale_price : $product->retail_price;
                    $total = $price * $qty;

                    $saleId = DB::table('sales')->insertGetId([
                        'location_id' => $shopId,
                        'sold_by' => $sellerUser,
                        'payment_method' => $paymentMethods[array_rand($paymentMethods)],
                        'total_amount' => $total,
                        'discount_amount' => 0,
                        'sale_date' => $saleDate,
                        'created_at' => now()->subDays($day)->addHours(rand(8, 20)),
                        'updated_at' => now()->subDays($day)->addHours(rand(8, 20)),
                    ]);

                    DB::table('sale_items')->insert([
                        'sale_id' => $saleId,
                        'product_id' => $product->id,
                        'quantity' => $qty,
                        'unit_price' => $price,
                        'unit_cost' => $product->latest_cost,
                        'price_tier' => $isBulk ? 'wholesale' : 'retail',
                        'created_at' => now()->subDays($day)->addHours(rand(8, 20)),
                    ]);

                    DB::table('stock_movements')->insert([
                        'product_id' => $product->id,
                        'location_id' => $shopId,
                        'movement_type' => 'sale',
                        'quantity' => -$qty,
                        'reference_type' => 'sale',
                        'reference_id' => $saleId,
                        'unit_cost' => $product->latest_cost,
                        'performed_by' => $sellerUser,
                        'created_at' => now()->subDays($day)->addHours(rand(8, 20)),
                    ]);
                }

                // Monthly expenses (first day of each month)
                if (now()->subDays($day)->day === 1) {
                    foreach (['rent' => 800000, 'electricity' => 150000, 'security' => 200000] as $cat => $amount) {
                        DB::table('expenses')->insert([
                            'location_id' => $shopId,
                            'category' => $cat,
                            'amount' => $amount + rand(-50000, 50000),
                            'expense_date' => $saleDate,
                            'recorded_by' => $sellerUser,
                            'created_at' => now()->subDays($day),
                            'updated_at' => now()->subDays($day),
                        ]);
                    }
                }
            }
        }
    }
}
