#!/bin/bash
set -euo pipefail

# First-time server setup for /opt/new-project
# Run this once on the server: ssh new-project-server 'bash -s' < scripts/server-init.sh

REMOTE_DIR="/opt/new-project"
REPO="https://github.com/MHDGhua/cq-labor-assistant.git"

echo "==> Cloning repository..."
if [ -d "$REMOTE_DIR/.git" ]; then
  echo "    Already cloned, pulling latest..."
  cd "$REMOTE_DIR" && git pull origin main
else
  git clone "$REPO" "$REMOTE_DIR"
  cd "$REMOTE_DIR"
fi

echo "==> Creating .env from example..."
if [ ! -f "$REMOTE_DIR/.env" ]; then
  cp "$REMOTE_DIR/.env.example" "$REMOTE_DIR/.env"
  echo "    IMPORTANT: Edit /opt/new-project/.env with production values"
fi

echo "==> Installing dependencies and building frontend..."
docker run --rm --network host -v "$(pwd):/app" -w /app node:20-alpine sh -c "npm config set registry https://registry.npmmirror.com && npm install && npx next build"

echo "==> Building and starting services..."
docker compose -f docker-compose.prod.yml build frontend
docker compose -f docker-compose.prod.yml up -d

echo "==> Setup complete!"
echo "    Edit .env with production secrets, then restart:"
echo "    docker compose -f docker-compose.prod.yml up -d"
