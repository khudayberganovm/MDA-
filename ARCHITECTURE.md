# MOTION AI — Architecture (MVP v1)

One TypeScript codebase, three roles started by `src/main.ts <api|bot|worker|all>`.
They share SQLite (Prisma) and `MEDIA_DIR`.

```
Telegram ── bot (grammY, long polling) ──┐
Mini App (React/Vite/Tailwind) ── api (Fastify) ── SQLite (User/Project/Job)
                                                    │  (status=queued)
                       worker (1 job at a time) ◄───┘
                         plan   → Claude (structured output, Zod)   | DEMO storyboard
                         source → Pexels portrait clips (cached)    | typography fallback
                         voice  → ElevenLabs TTS per scene          | DEMO narration fixtures
                         render → Remotion (Chrome headless) → H.264/AAC MP4 → ffprobe check
                         notify → Bot API sendVideo / error message
```

## Key files
- `src/config.ts`: env validation; `providers.*` is true only if key set AND `ENABLE_PAID_APIS=true`.
- `src/api/server.ts`: REST API, Telegram initData auth (`Authorization: tma <initData>`), dev auth (`dev <id>`, non-prod only), logo upload, signed download links (`/dl/:id?exp&sig`), and it serves `webapp/dist`.
- `src/lib/telegramAuth.ts`: HMAC validation of initData.
- `src/lib/projects.ts`: user upsert, project creation with per-user limits, signed links.
- `src/worker/worker.ts`: DB queue: claim with conditional `updateMany`, retries with backoff, recovery of `running` jobs on start, timeout, output cleanup.
- `src/pipeline/*`: `planner` (Claude), `stock` (Pexels), `voice` (ElevenLabs + scene timing), `render` (Remotion bundle + loopback asset server + ffprobe validation), `run` (stage orchestration), `demo` (demo script + fixtures).
- `remotion/Ad.tsx`: one composition `Ad`. `template=business` (stock clips, Ken Burns, gradient overlay, highlighted captions, CTA) or `template=minimal` (gradient/shape typography). Motions: fade/slide/scale/zoom. Style `dynamic` = faster motion and stronger zoom.
- `webapp/src/App.tsx`: Mini App (Home / Create / Projects / Profile).

## Timing
Each scene lasts max(planned seconds, narration + 0.6 s). If the total is shorter than the requested 15/30 s, scenes are stretched proportionally. Captions highlight words evenly across the narration length (no forced alignment yet).

## Statuses
Project: draft → queued → planning → sourcing → voicing → rendering → completed | failed.
Job: queued | running | done | failed (with `stage`, `progress`, `retryCount`, `error`).

## Moving to PostgreSQL
Set `provider = "postgresql"` in `prisma/schema.prisma` and a postgres `DATABASE_URL`, then run `npx prisma migrate dev`. No raw SQL is used.
