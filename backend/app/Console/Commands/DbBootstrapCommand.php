<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DbBootstrapCommand extends Command
{
    protected $signature   = 'db:bootstrap';
    protected $description = 'Create the restricted app database role if it does not exist (Railway first-deploy setup)';

    public function handle(): int
    {
        $appUser = config('database.connections.pgsql.username');
        $appPass = config('database.connections.pgsql.password');
        $dbName  = config('database.connections.pgsql_owner.database');

        if (! $appUser || ! $appPass) {
            $this->error('DB_USERNAME or DB_PASSWORD is not configured.');
            return 1;
        }

        // Check if the role already exists
        $exists = DB::connection('pgsql_owner')
            ->selectOne('SELECT 1 FROM pg_roles WHERE rolname = ?', [$appUser]);

        if (! $exists) {
            $escapedPass = str_replace("'", "''", $appPass);
            DB::connection('pgsql_owner')->statement(
                "CREATE ROLE \"{$appUser}\" WITH LOGIN PASSWORD '{$escapedPass}' NOBYPASSRLS"
            );
            $this->info("Created role: {$appUser}");
        } else {
            // Ensure NOBYPASSRLS is set on existing role
            DB::connection('pgsql_owner')->statement(
                "ALTER ROLE \"{$appUser}\" NOBYPASSRLS"
            );
            $this->info("Role already exists: {$appUser}");
        }

        // Grant CONNECT on the database
        DB::connection('pgsql_owner')->statement(
            "GRANT CONNECT ON DATABASE \"{$dbName}\" TO \"{$appUser}\""
        );

        // Grant USAGE on the public schema
        DB::connection('pgsql_owner')->statement(
            "GRANT USAGE ON SCHEMA public TO \"{$appUser}\""
        );

        // Grant DML on all existing tables
        DB::connection('pgsql_owner')->statement(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{$appUser}\""
        );

        // Grant sequence usage (for auto-increment IDs)
        DB::connection('pgsql_owner')->statement(
            "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"{$appUser}\""
        );

        // Ensure future tables created by migrations are also accessible
        DB::connection('pgsql_owner')->statement(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"{$appUser}\""
        );
        DB::connection('pgsql_owner')->statement(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO \"{$appUser}\""
        );

        $this->info("Bootstrap complete. Role \"{$appUser}\" is ready.");

        return 0;
    }
}
