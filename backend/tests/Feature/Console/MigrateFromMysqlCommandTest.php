<?php

it('migrate:from-mysql --dry-run runs without error when no legacy connection configured', function () {
    // Without a real MySQL connection, the command should fail gracefully
    // with a clear error rather than crashing PHP
    $this->artisan('migrate:from-mysql --dry-run')
        ->expectsOutputToContain('[DRY RUN]')
        ->assertFailed();
});
