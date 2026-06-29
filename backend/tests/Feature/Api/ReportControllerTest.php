<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;

it('admin can download weekly report as PDF', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $response = $this->get('/api/v1/reports/weekly');

    $response->assertOk()
        ->assertHeader('Content-Type', 'application/pdf');
});

it('admin can download monthly report as PDF', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $response = $this->get('/api/v1/reports/monthly');

    $response->assertOk()
        ->assertHeader('Content-Type', 'application/pdf');
});

it('seller cannot download reports', function () {
    Sanctum::actingAs(User::factory()->seller()->create());

    $this->get('/api/v1/reports/weekly')->assertForbidden();
    $this->get('/api/v1/reports/monthly')->assertForbidden();
});
