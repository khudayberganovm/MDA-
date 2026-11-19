# AWS deploy

- Server: EC2 `t3.small` (Ubuntu 24.04), code in `~/motion-ai` (a clone of this repo).
- **Auto-deploy:** `motion-update.timer` runs `deploy/update.sh` every minute. When `origin/main` has a new commit, the server pulls it and rebuilds with `docker compose -f deploy/docker-compose.aws.yml up -d --build`. Log: `~/deploy.log`.
- **Secrets stay on the server and are not in git:** `.env.prod` (app settings, API keys) and `deploy/.env` (`DOMAIN`, `MCP_SECRET`).
- **Ops MCP connector:** `deploy/ops-mcp.py` (systemd `motion-ops-mcp`), served by Caddy at `https://$DOMAIN/ops/$MCP_SECRET`. Add it in claude.ai → Settings → Connectors → Add custom connector. Its tools are: status, logs, redeploy, deploy_log, restart, env_status, set_env (only whitelisted keys: BOT_TOKEN, ADMIN_IDS, ADMIN_CHAT_ID, SUPPORT_USERNAME, REVISIONS_PER_ORDER, PAYME_*, CLICK_*, MANUAL_PAY_INFO). Anyone who has the URL can use these tools, so keep it private.
- First-time setup on a new server: clone the repo, create `.env.prod` and `deploy/.env` (`DOMAIN=...`), then run `deploy/install.sh` and `deploy/update.sh --force`.

- **Database:** `/data/orders.db` in the `data` volume (set in `docker-compose.aws.yml`). The previous video-pipeline DB `/data/motion.db` is kept but unused.
- **Payment callbacks:** Payme `https://$DOMAIN/pay/payme`, Click `https://$DOMAIN/pay/click/prepare` and `/pay/click/complete`.

Last auto-deploy test: 2026-11-14 21:55 UTC
