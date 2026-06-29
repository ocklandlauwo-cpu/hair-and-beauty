<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Weekly report: every Monday at 08:00 EAT
Schedule::command('reports:send-weekly')->weekly()->mondays()->at('08:00');

// Monthly report: 1st of each month at 08:00 EAT
Schedule::command('reports:send-monthly')->monthlyOn(1, '08:00');
