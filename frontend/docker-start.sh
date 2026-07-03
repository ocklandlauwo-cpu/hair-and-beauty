#!/bin/sh
set -e

PORT=${PORT:-8080}

# Write nginx config with the Railway-assigned port at runtime.
# \$uri etc. are escaped so the shell heredoc doesn't expand them —
# they reach nginx as literal $uri which nginx resolves itself.
cat > /etc/nginx/conf.d/default.conf << CONF
server {
    listen ${PORT};
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing: all unknown paths return index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Long-lived cache for hashed static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
CONF

exec nginx -g 'daemon off;'
