<?php

use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\MeController;
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

    // Catalogue — Phase 4
    // Inventory — Phase 4
});
