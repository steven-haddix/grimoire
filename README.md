# dnd-scribe

A Bun monorepo for a Discord-based D&D scribe. The bot streams voice audio to Deepgram for transcription, while the web app stores transcripts in Neon and summarizes sessions with Vercel AI SDK.

## Structure

```
/apps
  /bot  - Discord bot (Fly.io)
  /web  - Next.js admin + API (Vercel)
```

## Getting Started

```bash
bun install
```

### Web (Next.js)

```bash
bun dev:web
```

Set env vars in `apps/web/.env` (see `apps/web/.env.example`):
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `BOT_SECRET`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `NEXT_PUBLIC_DISCORD_APP_ID` (Discord Application ID)

Run migrations (from `apps/web`):

```bash
bunx drizzle-kit push
```

### Bot (Discord)

```bash
bun dev:bot
```

Set env vars in `apps/bot/.env` (see `apps/bot/.env.example`):
- `DISCORD_TOKEN`
- `DEEPGRAM_API_KEY`
- `TTS_PROVIDER` (optional; `deepgram`, `elevenlabs`, or `cartesia`)
- `TTS_VOICE` (provider voice id/name)
- `TTS_VOICE_OPTIONS` (optional JSON object string)
- `ELEVENLABS_API_KEY` (if using ElevenLabs)
- `CARTESIA_API_KEY` (if using Cartesia)
- `CARTESIA_BASE_URL` (optional)
- `NEXT_API_URL` (ex: `http://localhost:3000/api`)
- `BOT_SECRET` (same as web)
- `BOT_HTTP_PORT` (optional; defaults to `PORT` or `3001`)

## Deployment

### Neon
- Create a Neon project and copy `DATABASE_URL` into the web app env.

### Vercel
- Deploy `apps/web`.
- Add `DATABASE_URL`, `OPENAI_API_KEY`, `BOT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `NEXT_PUBLIC_DISCORD_APP_ID`.

### Fly.io
- From `apps/bot`, run `fly launch` (do not deploy yet).
- Set secrets:

```bash
fly secrets set \
  DISCORD_TOKEN=... \
  DEEPGRAM_API_KEY=... \
  TTS_PROVIDER=deepgram \
  TTS_VOICE=aura-asteria-en \
  ELEVENLABS_API_KEY=... \
  CARTESIA_API_KEY=... \
  CARTESIA_BASE_URL=https://api.cartesia.ai \
  NEXT_API_URL=https://your-vercel-app.com/api \
  BOT_SECRET=...
```

- Deploy:

```bash
fly deploy
```

## Notes

- If `nova-3` is unavailable in your Deepgram plan or region, update the bot config to `model: "nova-2"`.
- Discord message content intent must be enabled in your bot settings for `!scribe` commands.
- TTS playback requires `ffmpeg` installed on the host/container.
