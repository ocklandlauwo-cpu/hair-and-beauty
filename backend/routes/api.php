<?php

use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\MeController;
use App\Http\Controllers\Api\V1\BatchController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\ProductController;
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
    });
});
