<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can create, list, update, and delete a provider', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $createRes = $this->postJson('/api/v1/providers', ['name' => 'Provider One', 'phone' => '0712345678'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Provider One');
    $id = $createRes->json('data.id');

    $this->getJson('/api/v1/providers')->assertOk()
        ->assertJsonFragment(['name' => 'Provider One']);

    $this->putJson("/api/v1/providers/{$id}", ['name' => 'Provider One Updated', 'is_active' => false])
        ->assertOk()
        ->assertJsonPath('data.name', 'Provider One Updated')
        ->assertJsonPath('data.is_active', false);

    $this->deleteJson("/api/v1/providers/{$id}")->assertOk();
    expect(DB::table('providers')->find($id))->toBeNull();
});

it('seller cannot create, update, or delete a provider', function () {
    Sanctum::actingAs(User::factory()->seller()->create());

    $this->postJson('/api/v1/providers', ['name' => 'X'])->assertForbidden();

    $id = DB::table('providers')->insertGetId(['name' => 'Y', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

    $this->putJson("/api/v1/providers/{$id}", ['name' => 'Z'])->assertForbidden();
    $this->deleteJson("/api/v1/providers/{$id}")->assertForbidden();
});

it('seller can list providers (read access for the log-sale dropdown)', function () {
    DB::statement("SELECT set_config('app.role', 'admin', false)");
    DB::table('providers')->insert(['name' => 'Listable', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    Sanctum::actingAs(User::factory()->seller()->create());
    $this->getJson('/api/v1/providers')->assertOk()->assertJsonFragment(['name' => 'Listable']);
});

it('cannot delete a provider referenced by a saloon sale', function () {
    Sanctum::actingAs(User::factory()->admin()->create());
    DB::statement("SELECT set_config('app.role', 'admin', false)");

    $shopId = DB::table('locations')->insertGetId(['name' => 'PShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $providerId = DB::table('providers')->insertGetId(['name' => 'Referenced', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'Svc', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = DB::table('users')->where('role', 'admin')->first();
    DB::table('saloon_sales')->insert(['location_id' => $shopId, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 1000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    $this->deleteJson("/api/v1/providers/{$providerId}")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Cannot delete this provider because it has existing saloon sales.');
});
