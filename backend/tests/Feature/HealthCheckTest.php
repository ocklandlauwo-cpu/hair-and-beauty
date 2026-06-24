<?php

it('health endpoint returns ok', function () {
    $this->getJson('/up')->assertOk();
});

it('api ping returns ok json', function () {
    $this->getJson('/api/v1/ping')
        ->assertOk()
        ->assertExactJson(['status' => 'ok']);
});
