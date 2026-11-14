#!/bin/bash
# One-time server setup: auto-update timer + ops MCP service.
set -euo pipefail
DIR=$(cd "$(dirname "$0")/.." && pwd)
U=$(stat -c %U "$DIR")
grep -q '^MCP_SECRET=' "$DIR/deploy/.env" || echo "MCP_SECRET=$(openssl rand -hex 24)" >> "$DIR/deploy/.env"
chmod 600 "$DIR/deploy/.env"
sudo tee /etc/systemd/system/motion-update.service >/dev/null <<UNIT
[Unit]
Description=MOTION AI: pull origin/main and redeploy if changed
[Service]
Type=oneshot
User=$U
ExecStart=/bin/bash -c '$DIR/deploy/update.sh >> /home/$U/deploy.log 2>&1'
UNIT
sudo tee /etc/systemd/system/motion-update.timer >/dev/null <<UNIT
[Unit]
Description=Check GitHub for MOTION AI updates every minute
[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
UNIT
sudo tee /etc/systemd/system/motion-ops-mcp.service >/dev/null <<UNIT
[Unit]
Description=MOTION AI ops MCP server
After=docker.service
[Service]
User=$U
WorkingDirectory=$DIR
ExecStart=/usr/bin/python3 -I $DIR/deploy/ops-mcp.py
Restart=always
KillMode=process
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now motion-update.timer motion-ops-mcp.service
