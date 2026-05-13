#!/bin/bash
set -euo pipefail

# Deploy to production server (38.76.160.95)
# Strategy: build .next locally on server, then package into runtime image
# Reason: Docker build DNS is unstable on this server

SERVER="new-project-server"
REMOTE_DIR="/opt/new-project"
BRANCH="${1:-main}"

echo "==> Deploying branch: $BRANCH"

echo "==> Syncing code to server..."
ssh "$SERVER" "cd $REMOTE_DIR && git fetch origin && git checkout $BRANCH && git pull origin $BRANCH"

echo "==> Installing dependencies on server..."
ssh "$SERVER" "cd $REMOTE_DIR && docker run --rm -v \$(pwd):/app -w /app node:20-alpine npm ci --omit=dev"

echo "==> Building Next.js on server..."
ssh "$SERVER" "cd $REMOTE_DIR && docker run --rm -v \$(pwd):/app -w /app -e NODE_ENV=production node:20-alpine npm run build"

echo "==> Rebuilding and restarting containers..."
ssh "$SERVER" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build"

echo "==> Checking health..."
sleep 5
ssh "$SERVER" "curl -sf http://127.0.0.1:3000/api/healthz && echo ' OK' || echo ' FAILED'"

echo "==> Deploy complete!"
echo "    Site: https://tinko.xin"
echo "    Version: $(git describe --tags --always)"
