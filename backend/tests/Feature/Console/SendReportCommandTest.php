<?php

use App\Mail\MonthlyReportMail;
use App\Mail\WeeklyReportMail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

it('send-weekly command dispatches mail to all active admins', function () {
    Mail::fake();

    User::factory()->admin()->create(['email' => 'admin1@test.com', 'is_active' => true]);
    User::factory()->admin()->create(['email' => 'admin2@test.com', 'is_active' => true]);
    User::factory()->admin()->create(['email' => 'inactive@test.com', 'is_active' => false]);

    $this->artisan('reports:send-weekly')->assertSuccessful();

    Mail::assertSent(WeeklyReportMail::class, 2); // only the 2 active admins
});

it('send-monthly command dispatches mail to all active admins', function () {
    Mail::fake();

    User::factory()->admin()->create(['email' => 'madmin@test.com', 'is_active' => true]);

    $this->artisan('reports:send-monthly')->assertSuccessful();

    Mail::assertSent(MonthlyReportMail::class, 1);
});

it('send-weekly --dry-run does not send mail', function () {
    Mail::fake();
    User::factory()->admin()->create();

    $this->artisan('reports:send-weekly --dry-run')->assertSuccessful();

    Mail::assertNothingSent();
});
