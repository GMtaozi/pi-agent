# Phase 3: Production Deployment

> Date: 2026-08-18
> Status: Configuration complete, pending real environment validation

## 1. Deployment Architecture

Internet -> Nginx (80/443) -> Server (3001) -> Data Volume

## 2. File List

- Dockerfile
- docker-compose.yml
- docker-compose.dev.yml
- nginx.conf
- pm2.config.js
- .env.example
- deploy.sh

## 3. Docker Deployment

### Build image
docker build -t workforge:latest .

### Start services
docker-compose up -d

### Verify
curl http://localhost/api/health

### View logs
docker-compose logs -f server

## 4. PM2 Deployment

### Start
pnpm build
pm2 start pm2.config.js

### Commands
pm2 status
pm2 logs workforge-server
pm2 restart workforge-server

## 5. Nginx Configuration

- API proxy: /api/* -> http://server:3001/api/
- WebSocket: /ws, /api/monitoring/ws
- SSE: /api/sessions/ with proxy_buffering off
- Static files: frontend build with 1d cache
- Security headers: X-Frame-Options, X-Content-Type-Options

## 6. Environment Variables

NODE_ENV=production
PORT=3001
DATABASE_PATH=./data/workforge.db
ESBUILD_NO_SERVICE_WORKER=1
CACHE_TTL=5000
MAX_CACHE_SIZE=1000

## 7. One-click Deploy

Development: pnpm deploy:dev
Production: pnpm deploy

## 8. Notes

- Docker build requires network access to Docker Hub
- Data directory ./data needs persistent storage
- Configure SSL certificates in ./ssl/ for HTTPS
