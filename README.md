# dnd-scribe

A Bun monorepo for a Discord-based D&D scribe.

## Architecture

- `apps/bot`: Discord runtime (voice capture, STT, agent, summarization).
- `apps/web`: Next.js dashboard/auth/config UI.
- `packages/data`: shared Drizzle schema + repository layer for runtime tables.

The bot writes runtime data directly to Postgres (`sessions`, `transcripts`, `summaries`, `memories`, `chat_messages`, `bot_guilds`) so it can keep operating even if the web app is down.

## Structure

```text
/apps
  /bot  - Discord bot (Fly.io)
  /web  - Next.js dashboard + auth
/packages
  /data - shared DB schema/client/repos
```

## Getting Started

```bash
bun install
```

### Database schema

From repo root:

```bash
bun db:push
```

### Web (dashboard)

```bash
bun dev:web
```

Set env vars in `apps/web/.env` (see `apps/web/.env.example`):
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `NEXT_PUBLIC_DISCORD_APP_ID`
- `UPSTASH_REDIS_REST_URL` (optional)
- `UPSTASH_REDIS_REST_TOKEN` (optional)
- `LANGFUSE_SECRET_KEY` (optional)
- `LANGFUSE_PUBLIC_KEY` (optional)
- `LANGFUSE_BASEURL` (optional)

### Bot (runtime)

```bash
bun dev:bot
```

Set env vars in `apps/bot/.env` (see `apps/bot/.env.example`):
- `DISCORD_TOKEN`
- `DISCORD_APP_ID` (Discord Application ID)
- `DATABASE_URL`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `DEEPGRAM_API_KEY`
- `STT_PROVIDER` (optional; `deepgram` or `assemblyai`)
- `TTS_PROVIDER` (optional; `deepgram`, `elevenlabs`, `cartesia`, `inworld`)
- `TTS_VOICE`
- `TTS_VOICE_OPTIONS` (optional JSON object string)
- `ELEVENLABS_API_KEY` (if using ElevenLabs)
- `CARTESIA_API_KEY` (if using Cartesia)
- `CARTESIA_BASE_URL` (optional)
- `INWORLD_API_KEY` (if using Inworld)
- `BOT_HTTP_PORT` (optional; defaults to `PORT` or `3001`)

## Deployment

### Neon
- Create a Neon project and set `DATABASE_URL` for both bot and web.

### Vercel (`apps/web`)
- Deploy dashboard/auth app.
- Add web env vars above.

### Fly.io (`apps/bot`)
- From repo root, run `fly launch --config apps/bot/fly.toml` (do not deploy yet).
- Set secrets:

```bash
fly secrets set --config apps/bot/fly.toml \
  DISCORD_TOKEN=... \
  DISCORD_APP_ID=... \
  DATABASE_URL=... \
  GOOGLE_GENERATIVE_AI_API_KEY=... \
  DEEPGRAM_API_KEY=... \
  TTS_PROVIDER=deepgram \
  TTS_VOICE=aura-asteria-en
```

- Deploy:

```bash
fly deploy --config apps/bot/fly.toml
```

## Quality checks

- `bun check`
- `bun lint`
- `bun format`

## Notes

- Discord message content intent should be enabled if you want the bot to read @mention prompts.
- Deepgram `nova-3` availability varies by account/region.
- Bot HTTP server exposes `GET /healthz` and `GET /readyz`.
