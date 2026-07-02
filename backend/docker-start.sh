#!/bin/sh
set -e

PORT=${PORT:-8080}

# Write Apache VirtualHost with the Railway-assigned port at runtime
cat > /etc/apache2/sites-available/000-default.conf << APACHECONF
<VirtualHost *:${PORT}>
    DocumentRoot /var/www/html/public
    <Directory /var/www/html/public>
        AllowOverride All
        Require all granted
    </Directory>
    ErrorLog /proc/1/fd/2
    CustomLog /proc/1/fd/1 combined
</VirtualHost>
APACHECONF

# Tell Apache to listen on the correct port
sed -i "s/Listen 80/Listen ${PORT}/" /etc/apache2/ports.conf

# Run all Laravel artisan commands as www-data (non-root)
gosu www-data php artisan config:cache
gosu www-data php artisan route:cache
gosu www-data php artisan view:cache
gosu www-data php artisan storage:link --quiet
gosu www-data php artisan db:bootstrap
gosu www-data php artisan migrate --force

# Start Apache — main process is root (standard for Apache; worker
# processes run as www-data per Apache's User/Group directives)
exec apache2-foreground
