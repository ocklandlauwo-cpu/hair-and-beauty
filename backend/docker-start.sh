#!/bin/sh
set -e

PORT=${PORT:-8080}
echo "[start] PORT=${PORT} FRONTEND_URL=${FRONTEND_URL}"

gosu www-data php artisan config:cache
gosu www-data php artisan route:cache
gosu www-data php artisan view:cache
gosu www-data php artisan storage:link --force --quiet
gosu www-data php artisan db:bootstrap
gosu www-data php artisan migrate --force --database=pgsql_owner
gosu www-data php artisan db:bootstrap

echo "[start] launching on port ${PORT}"
exec gosu www-data php artisan serve --host=0.0.0.0 --port=${PORT}
