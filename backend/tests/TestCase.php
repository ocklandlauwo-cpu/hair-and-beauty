<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    /**
     * Set a permissive RLS context (admin) before each test so that
     * fixture inserts are not blocked by row-level security policies.
     * Individual RLS tests override this with withRlsContext() as needed.
     */
    protected function setUp(): void
    {
        parent::setUp();

        DB::statement("SELECT set_config('app.role', 'admin', false)");
        DB::statement("SELECT set_config('app.location_ids', '[]', false)");
    }

    protected function tearDown(): void
    {
        // Clean up GUC state so it does not leak across tests
        try {
            DB::unprepared('RESET app.role');
            DB::unprepared('RESET app.location_ids');
        } catch (\Throwable) {
            // Ignore if connection already closed
        }

        parent::tearDown();
    }
}
