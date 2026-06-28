<?php

namespace App\Providers;

use App\Models\Client;
use App\Models\Distribution;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Reconciliation;
use App\Models\Sale;
use App\Models\User;
use App\Policies\ClientPolicy;
use App\Policies\DistributionPolicy;
use App\Policies\ProductPolicy;
use App\Policies\PurchasePolicy;
use App\Policies\ReconciliationPolicy;
use App\Policies\SalePolicy;
use App\Policies\UserManagementPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(Distribution::class, DistributionPolicy::class);
        Gate::policy(Product::class, ProductPolicy::class);
        Gate::policy(Purchase::class, PurchasePolicy::class);
        Gate::policy(Sale::class, SalePolicy::class);
        Gate::policy(Client::class, ClientPolicy::class);
        Gate::policy(Reconciliation::class, ReconciliationPolicy::class);
        Gate::policy(User::class, UserManagementPolicy::class);
    }
}
