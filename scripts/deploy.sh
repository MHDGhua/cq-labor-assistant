#!/bin/bash
set -euo pipefail

# Deploy to production server (38.76.160.95)
# Strategy: build .next locally on server, then package into runtime image
# Reason: Docker build DNS is unstable on this server

SSH_OPTS="-o StrictHostKeyChecking=no -i C:/sshkeys/new_project_rsa_clean -o PubkeyAcceptedAlgorithms=rsa-sha2-256 -o IdentitiesOnly=yes"
SERVER="root@38.76.160.95"
REMOTE_DIR="/opt/new-project"
BRANCH="${1:-main}"

remote() { ssh $SSH_OPTS "$SERVER" "$@"; }

echo "==> Deploying branch: $BRANCH"

echo "==> Syncing code to server..."
remote "cd $REMOTE_DIR && git fetch origin && git checkout $BRANCH && git reset --hard origin/$BRANCH"

echo "==> Installing dependencies on server..."
remote "cd $REMOTE_DIR && docker run --rm --network host -v \$(pwd):/app -w /app node:20-alpine sh -c 'npm config set registry https://registry.npmmirror.com && npm install'"

echo "==> Building Next.js on server..."
remote "cd $REMOTE_DIR && docker run --rm --network host -v \$(pwd):/app -w /app -e NODE_ENV=production node:20-alpine sh -c 'npx next build'"

echo "==> Rebuilding frontend container..."
remote "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml build frontend && docker compose -f docker-compose.prod.yml up -d frontend"

echo "==> Checking health..."
sleep 8
remote "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml exec frontend wget -qO- http://127.0.0.1:3000/api/healthz && echo ' OK' || echo ' FAILED'"

echo "==> Deploy complete!"
echo "    Site: https://tinko.xin"
echo "    Version: $(git describe --tags --always)"
