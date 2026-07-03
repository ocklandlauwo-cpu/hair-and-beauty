#!/bin/sh
set -e

PORT=${PORT:-8080}
echo "[start] PORT=${PORT} FRONTEND_URL=${FRONTEND_URL}"
echo "[env] $(env | grep -E 'PORT|HOST|RAILWAY' | tr '\n' ' ')"

gosu www-data php artisan config:cache
gosu www-data php artisan route:cache
gosu www-data php artisan view:cache
gosu www-data php artisan storage:link --force --quiet
gosu www-data php artisan db:bootstrap
gosu www-data php artisan migrate --force --database=pgsql_owner
gosu www-data php artisan db:bootstrap

echo "[start] launching on port ${PORT}"
# PHP_CLI_SERVER_WORKERS allows concurrent connections; bypassing artisan to reduce startup overhead
export PHP_CLI_SERVER_WORKERS=4
exec gosu www-data php -S 0.0.0.0:${PORT} -t public/
