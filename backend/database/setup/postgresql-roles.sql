-- =============================================================================
-- Hair & Beauty Intelligence Platform — PostgreSQL initial role + database setup
-- Run ONCE as the PostgreSQL superuser (postgres) in Laragon's psql or pgAdmin.
-- This script is idempotent-safe to re-run only if roles/database do not exist.
-- DO NOT execute via artisan or any application user.
-- =============================================================================

-- Run as postgres superuser
-- Step A: create roles
CREATE ROLE hairbeauty_owner
    WITH LOGIN
         PASSWORD 'owner_secret'
         CREATEROLE
         CREATEDB
         BYPASSRLS;

CREATE ROLE hairbeauty_app
    WITH LOGIN
         PASSWORD 'app_secret'
         NOBYPASSRLS;

-- Step B: create database
CREATE DATABASE hairbeauty OWNER hairbeauty_owner;

-- Step C: connect to the new database and grant app-role access
\connect hairbeauty

GRANT CONNECT ON DATABASE hairbeauty TO hairbeauty_app;
GRANT USAGE  ON SCHEMA public TO hairbeauty_app;

-- All tables created by hairbeauty_owner automatically inherit these grants
ALTER DEFAULT PRIVILEGES FOR ROLE hairbeauty_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hairbeauty_app;

ALTER DEFAULT PRIVILEGES FOR ROLE hairbeauty_owner IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO hairbeauty_app;
