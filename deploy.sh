#!/bin/bash
set -e

echo "🚀 Starting WorkForge deployment..."

# Build
echo "📦 Building server and web..."
pnpm build

# Create directories
echo "📁 Creating directories..."
mkdir -p data logs

# Build Docker image
echo "🐳 Building Docker image..."
docker-compose build

# Stop old containers
echo "🛑 Stopping old containers..."
docker-compose down || true

# Start new containers
echo "▶️ Starting new containers..."
docker-compose up -d

# Wait for health check
echo "⏳ Waiting for health check..."
sleep 5

# Check health
echo "🔍 Checking health..."
curl -f http://localhost:3001/api/health || exit 1

echo "✅ Deployment complete!"
echo "🌐 Server running at http://localhost"
echo "📊 Health check at http://localhost:3001/api/health"
