<?php

use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('v1.')->group(function () {
    Route::get('/ping', fn () => response()->json(['status' => 'ok']))->name('ping');

    // Auth  — Phase 4
    // Catalogue — Phase 4
    // Inventory — Phase 4
});
