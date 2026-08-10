#!/usr/bin/env bash
# Sync the repo to the EC2 box and (re)start the stack.
# Usage: ./deploy/sync.sh <public-ip> <domain>
set -euo pipefail

IP="${1:?usage: sync.sh <public-ip> <domain>}"
DOMAIN="${2:?usage: sync.sh <public-ip> <domain>}"
KEY_FILE="$HOME/.ssh/lumi-key.pem"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude tsconfig.tsbuildinfo \
  -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=accept-new" \
  "$REPO_DIR/" "ubuntu@$IP:~/lumi/"

ssh -i "$KEY_FILE" "ubuntu@$IP" \
  "cd ~/lumi && echo DOMAIN=$DOMAIN > .env && \
   docker compose -f docker-compose.prod.yml up -d --build && \
   docker compose -f docker-compose.prod.yml ps"
