# MOTION AI

A Telegram bot and Mini App that turn a text prompt into a 9:16 ad video: script → scenes → stock clips → AI voice → subtitles → MP4.

Stack: TypeScript, Node 22, grammY, Fastify, Prisma + SQLite, React + Vite + Tailwind, Remotion (Chrome headless + FFmpeg), Claude API, Pexels, ElevenLabs.
Output: 1080×1920, 30 fps, H.264 + AAC MP4.

See [ARCHITECTURE.md](ARCHITECTURE.md) and [TODO.md](TODO.md).

## Quick start (local)

```bash
npm install
cp .env.example .env          # then edit it
npx prisma db push            # creates SQLite DB
npm run build:web             # builds the Mini App into webapp/dist
npm start                     # api + bot + worker in one process
```
Open http://localhost:8080. Outside Telegram it uses dev auth (`DEV_AUTH=true`, refused when `NODE_ENV=production`).

Run the roles separately (recommended in production):
```bash
npm run api      # Fastify + Mini App
npm run bot      # Telegram bot (needs BOT_TOKEN)
npm run worker   # render worker (one job at a time)
```
For Mini App development with hot reload, run `npm run dev:web` (port 5173, proxies /api to 8080).

On the first render, Remotion downloads Chrome Headless Shell (~150 MB). Set `BROWSER_EXECUTABLE` to use a binary you already have.

## Modes and keys

| Provider | Needed for | If missing |
|---|---|---|
| `ANTHROPIC_API_KEY` | script and storyboard | with `DEMO_MODE=true`: a fixed sample script, labelled **DEMO**; otherwise the job fails with a clear message |
| `PEXELS_API_KEY` | stock clips | animated typography scenes |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_*` | narration | demo storyboards use the bundled fixtures (macOS `say`, not AI); AI storyboards fail with a clear message |
| `BOT_TOKEN` | bot, notifications, initData auth | bot is disabled |

Paid APIs are only called when the key is set **and** `ENABLE_PAID_APIS=true`.
ElevenLabs: the default models are `eleven_v3` for Uzbek and `eleven_multilingual_v2` for Russian. Check Uzbek support for your model and voice on ElevenLabs' models page before you rely on it.

## Telegram setup
1. Create a bot with @BotFather and put its token in `BOT_TOKEN`.
2. Expose the API over HTTPS (a domain with Caddy/nginx, or a tunnel such as `cloudflared tunnel --url http://localhost:8080`). Set `PUBLIC_URL` and `WEBAPP_URL` to that HTTPS URL.
3. Optionally set the Mini App URL in BotFather (`/newapp` or Menu Button). The bot also sets the menu button itself.

## Tests
```bash
npm run typecheck
npm run test:e2e                                   # 30 s professional, uz
npm run test:e2e -- --style minimal --duration 15
```
The e2e test starts the API, creates a project with dev auth, runs the worker until the project finishes, checks access control, downloads the file through a signed link and runs ffprobe on it.

## Docker
```bash
docker compose up -d --build
```
This starts the `app` (API + Mini App), `bot` and `worker` services, which share the `/data` volume (SQLite + media).

## Oracle Cloud Always Free (ARM64 Ubuntu): not tested yet
1. Create an Ampere A1 VM (4 OCPU / 24 GB) with Ubuntu 22.04/24.04. Open port 443 in the VCN security list and in `iptables`.
2. Install Docker: `curl -fsSL https://get.docker.com | sh`. Then clone the repo, create `.env` and run `docker compose up -d --build`.
3. Put Caddy in front for HTTPS: `caddy reverse-proxy --from your.domain --to localhost:8080`.

ARM64 caveat: Remotion publishes Linux ARM64 builds of its compositor and of Chrome Headless Shell, but this project has **not** been rendered on ARM64 Linux. If the browser download fails there, install Chromium (`apt install chromium`), set `BROWSER_EXECUTABLE=/usr/bin/chromium`, and test with `npm run test:e2e`. The fallback is an x86_64 VM.

## Push to GitHub
```bash
git remote add origin git@github.com:<you>/motion-ai.git
git push -u origin main
```

## Verification (2026-11-14, macOS arm64, Node 22.23.5, DEMO mode, no paid keys)
| Check | Result |
|---|---|
| `npm install`, `tsc --noEmit`, `vite build` | ✅ |
| `prisma db push` (SQLite) | ✅ |
| API starts, Mini App loads at :8080 (dev auth) | ✅ |
| Prompt submitted from the Mini App → project + job queued | ✅ |
| Storyboard | ✅ demo storyboard, labelled DEMO (no Claude key) |
| Media | ✅ typography fallback (no Pexels key) |
| Narration | ✅ demo fixture audio (no ElevenLabs key) |
| Remotion render → MP4 | ✅ 3 jobs rendered from the queue, one after another |
| ffprobe | ✅ 30.00 s, h264 1080×1920 + aac |
| Saved + signed download (200), tampered link (403), other user (404) | ✅ |
| Bot with real BOT_TOKEN, Claude/Pexels/ElevenLabs live calls, Docker, ARM64 Linux | ❌ not tested (no credentials / Docker in the dev environment) |

Render time: about 3 minutes per 30 s video on this Mac (RENDER_CONCURRENCY=2).
If Remotion's automatic browser download is slow, download Chrome Headless Shell yourself and set `BROWSER_EXECUTABLE`.
