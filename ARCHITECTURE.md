# Architecture

One Node.js process (`src/main.ts`, role `all`) runs the Fastify API, the Mini App static files and the grammY bot (long polling). SQLite via Prisma. Files live in `MEDIA_DIR`.

```
Mini App (React) ──/api──▶ Fastify ──▶ lib/orders.ts (state machine) ──▶ SQLite
Telegram ◀──── bot (grammY) / lib/notify.ts ◀──────────┘
Payme ──/pay/payme (JSON-RPC)──▶ payments/payme.ts ─┐
Click ──/pay/click/{prepare,complete}──▶ payments/click.ts ─┴▶ markPurchasePaid()
```

## Money model
- `Package` (1/5/10 videos) is bought as a `Purchase`. When it is paid, `User.credits += videos`.
- An `Order` uses 1 credit. Without credits it is created as `awaiting_payment` and linked to the purchase (`Purchase.orderId`); payment then submits it automatically.
- Payme cancellations after payment reverse the credits only if they are unused; otherwise the server answers `-31007`.
- Admin cancel of a paid order refunds the credit.

## Order states
`awaiting_payment → new → in_progress → delivered → completed`, with `delivered → revision → (in_progress) → delivered` while `revisionsLeft > 0`; any active state `→ cancelled`. All transitions are conditional `updateMany` calls, so double clicks and concurrent bot/app actions are safe.

## Security
- Mini App requests: Telegram `initData` HMAC check (`lib/telegramAuth.ts`); `DEV_AUTH` is refused in production.
- `/api/admin/*`: Telegram ID must be in `ADMIN_IDS`. In the bot, members of `ADMIN_CHAT_ID` are staff.
- Payme: HTTP Basic `Paycom:<PAYME_KEY>` (constant-time compare), amount check in tiyin. Click: MD5 `sign_string` check, amount check.
- Uploads: type detected from magic bytes; size limits per kind; stored under random names. Client files are reachable only with signed, expiring `/f/:id` links. Template previews are public (`/m/templates/*`).
- Template `agentNotes` are only returned to admins.

## Claude brief
`lib/format.ts → claudeBrief()` builds a Markdown brief from the template (including the admin-only agent notes), the agency snapshot, the tour details, signed links to the logo and materials, and the latest revision request. The team pastes it, or sends the `.md` file, into a new Claude chat with the video agent skill.
