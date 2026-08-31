<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can create, list, update, and delete a saloon service', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $createRes = $this->postJson('/api/v1/saloon-services', ['name' => 'Kuosha'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Kuosha');
    $id = $createRes->json('data.id');

    $this->getJson('/api/v1/saloon-services')->assertOk()
        ->assertJsonFragment(['name' => 'Kuosha']);

    $this->putJson("/api/v1/saloon-services/{$id}", ['name' => 'Kuosha Updated', 'is_active' => false])
        ->assertOk()
        ->assertJsonPath('data.name', 'Kuosha Updated')
        ->assertJsonPath('data.is_active', false);

    $this->deleteJson("/api/v1/saloon-services/{$id}")->assertOk();
    expect(DB::table('saloon_services')->find($id))->toBeNull();
});

it('seller cannot create a saloon service', function () {
    Sanctum::actingAs(User::factory()->seller()->create());
    $this->postJson('/api/v1/saloon-services', ['name' => 'X'])->assertForbidden();
});

it('cannot delete a saloon service referenced by a saloon sale', function () {
    Sanctum::actingAs(User::factory()->admin()->create());
    DB::statement("SELECT set_config('app.role', 'admin', false)");

    $shopId = DB::table('locations')->insertGetId(['name' => 'SShop'.uniqid(), 'type' => 'shop', 'geofence_radius_m' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $providerId = DB::table('providers')->insertGetId(['name' => 'P', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $serviceId = DB::table('saloon_services')->insertGetId(['name' => 'Referenced Svc', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    $admin = DB::table('users')->where('role', 'admin')->first();
    DB::table('saloon_sales')->insert(['location_id' => $shopId, 'provider_id' => $providerId, 'saloon_service_id' => $serviceId, 'amount' => 1000, 'sale_date' => today(), 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
    DB::unprepared('RESET app.role');

    $this->deleteJson("/api/v1/saloon-services/{$serviceId}")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Cannot delete this saloon service because it has existing saloon sales.');
});
