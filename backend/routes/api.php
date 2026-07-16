<?php

use App\Http\Controllers\Api\V1\AttendanceController;
use App\Http\Controllers\Api\V1\AskedProductController;
use App\Http\Controllers\Api\V1\ChartController;
use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\MeController;
use App\Http\Controllers\Api\V1\BatchController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\ClientController;
use App\Http\Controllers\Api\V1\CancelDistributionController;
use App\Http\Controllers\Api\V1\ConfirmDistributionController;
use App\Http\Controllers\Api\V1\RevertDistributionController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\DistributionController;
use App\Http\Controllers\Api\V1\ExpenseController;
use App\Http\Controllers\Api\V1\IncrementAskedProductController;
use App\Http\Controllers\Api\V1\FastestProductsController;
use App\Http\Controllers\Api\V1\LocationController;
use App\Http\Controllers\Api\V1\NewsController;
use App\Http\Controllers\Api\V1\PnlController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\PurchaseController;
use App\Http\Controllers\Api\V1\ReconciliationController;
use App\Http\Controllers\Api\V1\VerifyReconciliationController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\RevertSaleController;
use App\Http\Controllers\Api\V1\SaleController;
use App\Http\Controllers\Api\V1\StockController;
use App\Http\Controllers\Api\V1\TopClientsController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('v1.')->group(function () {
    Route::get('/ping', fn () => response()->json(['status' => 'ok']))->name('ping');

    Route::prefix('auth')->name('auth.')->group(function () {
        Route::post('/login', LoginController::class)
            ->middleware('throttle:5,1')
            ->name('login');
        Route::middleware('auth:sanctum')->group(function () {
            Route::post('/logout', LogoutController::class)->name('logout');
            Route::get('/me', MeController::class)->name('me');
        });
    });

    Route::middleware('auth:sanctum')->group(function () {
        // Catalogue
        Route::get('/categories', [CategoryController::class, 'index'])->name('categories.index');
        Route::post('/categories', [CategoryController::class, 'store'])->name('categories.store');
        Route::put('/categories/{category}', [CategoryController::class, 'update'])->name('categories.update');
        Route::apiResource('/products', ProductController::class);
        Route::get('/products/{product}/batches', [BatchController::class, 'index'])->name('products.batches.index');
        Route::post('/products/{product}/batches', [BatchController::class, 'store'])->name('products.batches.store');

        // Asked Products
        Route::apiResource('/asked-products', AskedProductController::class)->only(['index', 'destroy']);
        Route::post('/asked-products/{askedProduct}/increment', IncrementAskedProductController::class)->name('asked-products.increment');

        // Purchasing & Inventory
        Route::get('/locations', [LocationController::class, 'index'])->name('locations.index');
        Route::patch('/locations/{location}', [LocationController::class, 'update'])->name('locations.update');
        Route::apiResource('/purchases', PurchaseController::class)->only(['index', 'show']);
        Route::get('/stock', [StockController::class, 'index'])->name('stock.index');
        Route::get('/stock/movements', [StockController::class, 'movements'])->name('stock.movements');
        Route::get('/stock/alerts/expiry', [StockController::class, 'expiry'])->name('stock.expiry');
        Route::get('/stock/alerts/low', [StockController::class, 'low'])->name('stock.low');
        Route::get('/stock/alerts/slow', [StockController::class, 'slow'])->name('stock.slow');
        Route::get('/ai-reports/top-clients', TopClientsController::class)->name('ai-reports.top-clients');
        Route::get('/ai-reports/fastest-products', FastestProductsController::class)->name('ai-reports.fastest-products');

        // Distribution
        Route::apiResource('/distributions', DistributionController::class)->only(['index', 'show']);
        Route::post('/distributions/{distribution}/confirm', ConfirmDistributionController::class)->name('distributions.confirm');
        Route::post('/distributions/{distribution}/revert', RevertDistributionController::class)->name('distributions.revert');
        Route::post('/distributions/{distribution}/cancel', CancelDistributionController::class)->name('distributions.cancel');

        // POS
        Route::apiResource('/clients', ClientController::class)->only(['index', 'store', 'update', 'destroy']);
        Route::apiResource('/sales', SaleController::class)->only(['index', 'show']);
        Route::post('/sales/{sale}/revert', RevertSaleController::class)->name('sales.revert');

        // Reconciliation & User Management
        Route::apiResource('/reconciliations', ReconciliationController::class)->only(['index']);
        Route::post('/reconciliations/{reconciliation}/verify', VerifyReconciliationController::class)->name('reconciliations.verify');
        Route::apiResource('/users', UserController::class)->only(['index', 'store', 'update']);

        // Expenses
        Route::apiResource('/expenses', ExpenseController::class)->only(['index', 'show']);

        // Duplicate-protected create routes (10-second idempotency window)
        Route::middleware('no-dups')->group(function () {
            Route::post('/purchases', [PurchaseController::class, 'store'])->name('purchases.store');
            Route::post('/stock/adjust', [StockController::class, 'adjust'])->name('stock.adjust');
            Route::post('/distributions', [DistributionController::class, 'store'])->name('distributions.store');
            Route::post('/sales', [SaleController::class, 'store'])->name('sales.store');
            Route::post('/reconciliations', [ReconciliationController::class, 'store'])->name('reconciliations.store');
            Route::post('/expenses', [ExpenseController::class, 'store'])->name('expenses.store');
            Route::post('/asked-products', [AskedProductController::class, 'store'])->name('asked-products.store');
        });

        // News / Announcements
        Route::apiResource('/news', NewsController::class);

        // Attendance
        Route::get('/attendance', [AttendanceController::class, 'index'])->name('attendance.index');
        Route::post('/attendance', [AttendanceController::class, 'store'])->name('attendance.store');

        // Reports
        Route::get('/reports/pnl', [PnlController::class, 'index'])->name('reports.pnl');
        Route::get('/reports/weekly', [ReportController::class, 'weekly'])->name('reports.weekly');
        Route::get('/reports/monthly', [ReportController::class, 'monthly'])->name('reports.monthly');

        // Charts
        Route::get('/charts/sales-by-location',  [ChartController::class, 'salesByLocation'])->name('charts.sales');
        Route::get('/charts/profit-by-location', [ChartController::class, 'profitByLocation'])->name('charts.profit');
        Route::get('/charts/purchases-by-month', [ChartController::class, 'purchasesByMonth'])->name('charts.purchases');

        // Dashboard
        Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
    });
});
