#!/bin/bash
# Pull origin/main and rebuild if it changed. Run every minute by motion-update.timer.
# Usage: update.sh [--force]
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/motion-deploy.lock
flock -n 9 || { echo "deploy already running"; exit 0; }
git fetch -q origin main
OLD=$(git rev-parse HEAD); NEW=$(git rev-parse origin/main)
if [ "$OLD" = "$NEW" ] && [ "${1:-}" != "--force" ]; then exit 0; fi
echo "=== $(date -Is) deploy ${OLD:0:7} -> ${NEW:0:7}"
git reset -q --hard origin/main
docker compose -f deploy/docker-compose.aws.yml up -d --build --remove-orphans
docker image prune -f >/dev/null
if git diff --name-only "$OLD" "$NEW" | grep -q '^deploy/ops-mcp.py$'; then
  sudo systemctl restart motion-ops-mcp
fi
echo "=== $(date -Is) done ${NEW:0:7}"
