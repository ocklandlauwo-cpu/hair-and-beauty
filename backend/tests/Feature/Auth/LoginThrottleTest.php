<?php

use App\Models\User;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function () {
    RateLimiter::clear('login');
});

it('blocks login after 5 failed attempts within 1 minute', function () {
    User::factory()->create(['email' => 'throttle@test.com']);

    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/auth/login', [
            'email'    => 'throttle@test.com',
            'password' => 'wrong',
        ]);
    }

    $this->postJson('/api/v1/auth/login', [
        'email'    => 'throttle@test.com',
        'password' => 'wrong',
    ])->assertStatus(429);
});
