#!/bin/bash
# Production deployment script for WorkForge
# Usage: ./deploy.sh [check|start|stop|restart|logs|health]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    command -v docker >/dev/null 2>&1 || { error "Docker is required but not installed."; exit 1; }
    command -v docker-compose >/dev/null 2>&1 || { error "Docker Compose is required but not installed."; exit 1; }
    
    # Check required environment variables
    local required_vars=("POSTGRES_PASSWORD" "REDIS_PASSWORD" "JWT_SECRET" "SESSION_SECRET" "ADMIN_PASSWORD" "MINIO_ROOT_USER" "MINIO_ROOT_PASSWORD")
    local missing=0
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            error "Missing required environment variable: $var"
            missing=1
        fi
    done
    
    if [ $missing -eq 1 ]; then
        error "Please set all required environment variables. See .env.example for reference."
        exit 1
    fi
    
    # Check SSL certificates
    if [ ! -f "./ssl/cert.pem" ] || [ ! -f "./ssl/key.pem" ]; then
        warn "SSL certificates not found. Generating self-signed certificates..."
        mkdir -p ./ssl
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout ./ssl/key.pem \
            -out ./ssl/cert.pem \
            -subj "/CN=localhost" 2>/dev/null
        warn "Self-signed certificates generated. Replace with real certificates for production."
    fi
    
    log "Prerequisites check passed!"
}

# Build and start
start() {
    log "Starting WorkForge production environment..."
    
    check_prerequisites
    
    # Build images
    log "Building Docker images..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
    
    # Start services
    log "Starting services..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    
    # Wait for services to be healthy
    log "Waiting for services to be healthy..."
    sleep 10
    
    # Check service status
    local services=("postgres" "redis" "minio" "qdrant" "server" "nginx")
    for service in "${services[@]}"; do
        if docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps 2>/dev/null | grep -q "$service.*Up"; then
            log "✓ $service is running"
        else
            warn "✗ $service may not be running yet (still starting)"
        fi
    done
    
    log "WorkForge is now running!"
    log "  - Web UI: https://localhost"
    log "  - API: https://localhost/api"
    log "  - MinIO Console: http://localhost:9001"
}

# Stop
stop() {
    log "Stopping WorkForge..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
    log "WorkForge stopped."
}

# Restart
restart() {
    log "Restarting WorkForge..."
    stop
    start
}

# Show logs
logs() {
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=100 "$@"
}

# Health check
health() {
    log "Checking service health..."
    
    # Check API
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null | grep -q "200"; then
        log "✓ API is healthy"
    else
        error "✗ API health check failed"
    fi
    
    # Check Nginx
    if curl -s -o /dev/null -w "%{http_code}" https://localhost/health 2>/dev/null | grep -q "200"; then
        log "✓ Nginx is healthy"
    else
        warn "Nginx health check failed (may need SSL configuration)"
    fi
}

# Main
case "${1:-start}" in
    check)    check_prerequisites ;;
    start)    start ;;
    stop)     stop ;;
    restart)  restart ;;
    logs)     logs "${@:2}" ;;
    health)   health ;;
    *)        echo "Usage: $0 {check|start|stop|restart|logs|health}" ;;
esac
