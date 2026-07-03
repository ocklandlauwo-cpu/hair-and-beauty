#!/bin/sh
set -e

PORT=${PORT:-8080}
echo "[start] PORT=${PORT} FRONTEND_URL=${FRONTEND_URL}"

# Write nginx config directly to conf.d (avoids sites-enabled symlink issues)
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/conf.d/app.conf << NGINXCONF
server {
    listen ${PORT};
    root /var/www/html/public;
    index index.php index.html;

    access_log /dev/stdout;
    error_log /dev/stderr warn;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.ht {
        deny all;
    }
}
NGINXCONF

# Print full nginx config test output so we can see any errors
echo "[nginx-t]:"
nginx -t 2>&1 || { echo "[nginx-t FAILED] see error above"; exit 1; }

# Run all Laravel artisan commands as www-data (non-root)
gosu www-data php artisan config:cache
gosu www-data php artisan route:cache
gosu www-data php artisan view:cache
gosu www-data php artisan storage:link --force --quiet
gosu www-data php artisan db:bootstrap
gosu www-data php artisan migrate --force --database=pgsql_owner
# Re-run to grant access on all tables created by the migrations
gosu www-data php artisan db:bootstrap

# Start php-fpm as a background daemon (worker processes run as www-data)
php-fpm -D

# Start nginx in foreground as PID 1
echo "[start] launching nginx on port ${PORT}"
nginx -g 'daemon off;'
echo "[nginx exited unexpectedly]"
