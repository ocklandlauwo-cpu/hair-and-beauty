#!/bin/sh
set -e

PORT=${PORT:-8080}

# Write nginx site config with the Railway-assigned port at runtime
cat > /etc/nginx/sites-available/default << NGINXCONF
server {
    listen ${PORT};
    root /var/www/html/public;
    index index.php index.html;

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

# Ensure the symlink to the enabled site is current
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Run all Laravel artisan commands as www-data (non-root)
gosu www-data php artisan config:cache
gosu www-data php artisan route:cache
gosu www-data php artisan view:cache
gosu www-data php artisan storage:link --quiet
gosu www-data php artisan db:bootstrap
gosu www-data php artisan migrate --force --database=pgsql_owner
# Re-run to grant access on all tables created by the migrations
gosu www-data php artisan db:bootstrap

# Start php-fpm as a background daemon (worker processes run as www-data)
php-fpm -D

# Start nginx in foreground as PID 1
exec nginx -g 'daemon off;'
