FROM php:8.4-fpm

# System dependencies + nginx + gosu
RUN apt-get update && apt-get install -y \
    libpq-dev \
    libpng-dev \
    libzip-dev \
    libicu-dev \
    libonig-dev \
    libxml2-dev \
    curl \
    unzip \
    git \
    gosu \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# PHP extensions required by Laravel + PostgreSQL
RUN docker-php-ext-install \
    pdo \
    pdo_pgsql \
    pgsql \
    mbstring \
    xml \
    ctype \
    bcmath \
    fileinfo \
    zip \
    intl \
    pcntl \
    opcache

# OPcache — production settings
RUN { \
    echo "opcache.enable=1"; \
    echo "opcache.memory_consumption=128"; \
    echo "opcache.max_accelerated_files=10000"; \
    echo "opcache.validate_timestamps=0"; \
} > /usr/local/etc/php/conf.d/opcache-prod.ini

# Composer 2
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copy application files — owned by www-data from the start
COPY --chown=www-data:www-data . .

# Install production dependencies as www-data (not root)
RUN gosu www-data composer install --no-dev --optimize-autoloader --no-interaction

# Ensure Laravel's runtime directories exist with correct ownership
RUN mkdir -p storage/framework/sessions \
              storage/framework/views \
              storage/framework/cache \
              storage/logs \
              bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# Startup script
COPY docker-start.sh /usr/local/bin/docker-start.sh
RUN chmod +x /usr/local/bin/docker-start.sh

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/docker-start.sh"]
