# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (cached layer unless package files change)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Railway passes env vars matching ARG names as Docker build args automatically
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:alpine

# Copy built app from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Startup script writes nginx config with Railway's dynamic $PORT at runtime
COPY docker-start.sh /docker-start.sh
RUN chmod +x /docker-start.sh

EXPOSE 8080

CMD ["/docker-start.sh"]
