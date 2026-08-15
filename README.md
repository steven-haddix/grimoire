# dnd-scribe

A Bun monorepo for a Discord-based D&D scribe. The bot streams voice audio to Deepgram for transcription, while the web app stores transcripts in a Coolify-hosted Postgres database and summarizes sessions with Vercel AI SDK.

## Structure

```
/apps
  /bot  - Discord bot (Coolify)
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
- `LANGFUSE_SECRET_KEY` (optional; Langfuse tracing)
- `LANGFUSE_PUBLIC_KEY` (optional; Langfuse tracing)
- `LANGFUSE_BASEURL` (optional; Langfuse cloud region base URL)
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
- `DISCORD_APP_ID` (Discord Application ID; required for slash command registration)
- `DEEPGRAM_API_KEY`
- `ASSEMBLYAI_API_KEY` (if using AssemblyAI STT)
- `MISTRAL_API_KEY` (if using Mistral STT)
- `STT_PROVIDER` (optional; `deepgram`, `assemblyai`, `mistral`, or `mistral-realtime`)
- `MISTRAL_BASE_URL` (optional; defaults to `https://api.mistral.ai`)
- `MISTRAL_FLUSH_INTERVAL_MS` (optional; batch mistral only)
- `MISTRAL_CONTEXT_BIAS` (optional; batch mistral only)
- `MISTRAL_REALTIME_MODEL` (optional; realtime mistral only)
- `MISTRAL_REALTIME_CONNECT_TIMEOUT_MS` (optional; realtime mistral only)
- `MISTRAL_REALTIME_SILENCE_TIMEOUT_MS` (optional; realtime mistral only)
- `MISTRAL_REALTIME_MAX_QUEUE_BYTES` (optional; realtime mistral only)
- `MISTRAL_REALTIME_MAX_BUFFERED_TEXT_CHARS` (optional; realtime mistral only)
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

### Postgres (Coolify)
- Provision Postgres in Coolify and copy its connection string into the web
  app's `DATABASE_URL`.
- Apply generated migrations with `bun db:migrate`; `db:push` does not install
  the pgvector extension and indexes used by campaign search.
- Configure recurring database backups in Coolify.

### Vercel
- Deploy `apps/web`.
- Add `DATABASE_URL`, `OPENAI_API_KEY`, `BOT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASEURL`, `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`, and `NEXT_PUBLIC_DISCORD_APP_ID`.

### Bot (Coolify)
- Create a Dockerfile application rooted at `apps/bot`.
- Configure the bot environment variables listed above. `NEXT_API_URL` must
  include `/api`, and `BOT_SECRET` must match the web app.
- Expose the configured `BOT_HTTP_PORT` (default `3001`) and use `/health` for
  liveness. The response includes Discord and scheduler state.
- Keep one bot container running continuously and enable automatic restart.
  Game reminders are database-backed and processed by this service; no
  Coolify scheduled task is required.

## Weekly game reminders

Guild managers can say `@Grimoire my campaign is at 8:30pm EST on Wednesdays`
or use `/campaign schedule set`. Grimoire posts a Start recording button at
game time, a Stop & summarize reminder after three hours of recording, and
forcibly ends recording at four hours. Schedule and deadline jobs live in
Postgres, so restarts and deployments do not discard them.

## Notes

- If `nova-3` is unavailable in your Deepgram plan or region, update the bot config to `model: "nova-2"`.
- Discord message content intent should be enabled if you want the bot to read mention prompts for the agent.
- TTS playback requires `ffmpeg` installed on the host/container.
- Discord voice sessions now require DAVE/E2EE. Keep `daveEncryption` enabled and ensure `@snazzah/davey` is installed for the bot.
