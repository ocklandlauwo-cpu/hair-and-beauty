<?php

use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\MeController;
use App\Http\Controllers\Api\V1\BatchController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\ConfirmDistributionController;
use App\Http\Controllers\Api\V1\DistributionController;
use App\Http\Controllers\Api\V1\LocationController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\PurchaseController;
use App\Http\Controllers\Api\V1\StockController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('v1.')->group(function () {
    Route::get('/ping', fn () => response()->json(['status' => 'ok']))->name('ping');

    Route::prefix('auth')->name('auth.')->group(function () {
        Route::post('/login', LoginController::class)->name('login');
        Route::middleware('auth:sanctum')->group(function () {
            Route::post('/logout', LogoutController::class)->name('logout');
            Route::get('/me', MeController::class)->name('me');
        });
    });

    Route::middleware('auth:sanctum')->group(function () {
        // Catalogue
        Route::get('/categories', [CategoryController::class, 'index'])->name('categories.index');
        Route::apiResource('/products', ProductController::class);
        Route::get('/products/{product}/batches', [BatchController::class, 'index'])->name('products.batches.index');
        Route::post('/products/{product}/batches', [BatchController::class, 'store'])->name('products.batches.store');

        // Purchasing & Inventory
        Route::get('/locations', [LocationController::class, 'index'])->name('locations.index');
        Route::apiResource('/purchases', PurchaseController::class)->only(['index', 'show', 'store']);
        Route::get('/stock', [StockController::class, 'index'])->name('stock.index');
        Route::get('/stock/alerts/expiry', [StockController::class, 'expiry'])->name('stock.expiry');
        Route::get('/stock/alerts/low', [StockController::class, 'low'])->name('stock.low');

        // Distribution
        Route::apiResource('/distributions', DistributionController::class)->only(['index', 'show', 'store']);
        Route::post('/distributions/{distribution}/confirm', ConfirmDistributionController::class)->name('distributions.confirm');
    });
});
