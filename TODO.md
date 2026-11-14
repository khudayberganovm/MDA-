# TODO / status

## Verified locally (macOS arm64, Node 22)
See README "Verification" for the latest results.

## Not verified (no credentials in the dev environment)
- [ ] Real Claude storyboard (`ANTHROPIC_API_KEY` + `ENABLE_PAID_APIS=true`)
- [ ] Real Pexels clips (`PEXELS_API_KEY`); only the typography fallback is rendered so far
- [ ] Real ElevenLabs narration; Uzbek support of `ELEVENLABS_MODEL_UZ` must be checked on ElevenLabs' model page
- [ ] Telegram bot live run (`BOT_TOKEN`), Mini App inside Telegram (needs an HTTPS `WEBAPP_URL`)
- [ ] Docker image build, and Linux ARM64 (Oracle) rendering

## Next
- [ ] Word-level caption alignment (ElevenLabs `with-timestamps` endpoint)
- [ ] Background music bed with ducking
- [ ] Retry button in the Mini App for failed projects
- [ ] Persist the bot's `/new` conversation state (in memory now)
- [ ] Rate-limit the API per IP (`@fastify/rate-limit`)
- [ ] Brand color picker in the form (the templates already take accent colors)
- [ ] Use Prisma migrations instead of `db push` once the schema settles
