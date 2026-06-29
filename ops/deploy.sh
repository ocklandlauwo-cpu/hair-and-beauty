#!/usr/bin/env bash
# Hair & Beauty Intelligence — Production Deployment Script
# Run from the server as: bash ops/deploy.sh
# Prerequisites: git, PHP 8.4, composer, node 24, psql, DirectAdmin vhost configured

set -euo pipefail

REPO_DIR="/var/www/hairbeauty"           # Change to your server path
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"
PHP_BIN="/usr/bin/php8.4"               # Adjust for your server's PHP path
COMPOSER_BIN="/usr/local/bin/composer"

echo "==> Pulling latest code"
cd "$REPO_DIR"
git pull origin master

echo "==> Installing backend dependencies"
cd "$BACKEND_DIR"
"$COMPOSER_BIN" install --no-dev --optimize-autoloader

echo "==> Copying production env"
if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env.production.example" "$BACKEND_DIR/.env"
  echo "  IMPORTANT: Edit .env with real credentials, then re-run."
  exit 1
fi

echo "==> Running migrations (as hairbeauty_owner)"
"$PHP_BIN" artisan migrate --force

echo "==> Seeding roles (idempotent)"
"$PHP_BIN" artisan db:seed --class=RoleSeeder --force

echo "==> Clearing caches"
"$PHP_BIN" artisan config:clear
"$PHP_BIN" artisan route:clear
"$PHP_BIN" artisan view:clear

echo "==> Caching config and routes for production"
"$PHP_BIN" artisan config:cache
"$PHP_BIN" artisan route:cache

echo "==> Building frontend"
cd "$FRONTEND_DIR"
if [ ! -f ".env" ]; then
  cp ".env.example" ".env"
  echo "  IMPORTANT: Edit frontend/.env with VITE_API_URL, then re-run."
  exit 1
fi
npm ci --omit=dev
npm run build

echo "==> Copying frontend dist to web root"
# DirectAdmin: copy frontend/dist into public_html or a subdirectory
# Adjust TARGET_DIR to your DirectAdmin document root:
TARGET_DIR="/home/yourusername/public_html"
rsync -a --delete "$FRONTEND_DIR/dist/" "$TARGET_DIR/"

echo "==> Restarting PHP-FPM"
# Adjust service name for your DirectAdmin setup:
sudo systemctl reload php8.4-fpm 2>/dev/null || echo "  (PHP-FPM reload skipped — do manually)"

echo "==> Done. Verify at https://yourdomain.com"
