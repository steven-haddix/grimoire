# dnd-scribe — Agent Guide

This repo is a Bun monorepo for a Discord-based D&D scribe.

## Architecture (current)

- `apps/bot` is the runtime system of record for session behavior:
  - joins voice channels
  - streams audio to STT providers
  - persists transcripts/summaries/memory directly to Postgres
  - runs the Discord mention agent and summarization calls
- `apps/web` is dashboard/auth/config:
  - Better Auth + Discord OAuth
  - account/campaign/session reporting UI
  - user-auth API routes under `apps/web/src/app/api/discord/*`
- `packages/data` is shared data access:
  - runtime Drizzle schema in `packages/data/src/schema-runtime.ts`
  - DB client in `packages/data/src/client.ts`
  - shared repository functions in `packages/data/src/repos/*`

## End-to-end flow

1. User runs `/grim start` while in a voice channel.
2. Bot starts listening and inserts an active `sessions` row directly via `packages/data` repos.
3. For each speaker, bot streams audio to STT and inserts final transcript chunks into `transcripts`.
4. User runs `/grim stop`.
5. Bot summarizes locally (AI SDK), writes `summaries`, marks the session complete, and posts a short recap to Discord.
6. Web dashboard reads data from DB for reporting.

## Source of truth

Runtime data lives in Postgres and is accessed through `packages/data`:
- `campaigns`
- `bot_guilds`
- `sessions`
- `transcripts`
- `summaries`
- `memories`
- `chat_messages`

## Repo layout

- `package.json`: Bun workspaces + top-level scripts
- `apps/bot/`: Discord bot runtime (Fly.io)
  - `apps/bot/src/index.ts`: boot entrypoint
  - `apps/bot/src/app/bootstrap.ts`: dependency wiring
  - `apps/bot/src/agent/agent.ts`: mention agent runtime
  - `apps/bot/src/services/session-summarizer.ts`: summarization
- `apps/web/`: Next.js dashboard/auth app (Vercel)
  - `apps/web/src/app/api/discord/*`: frontend/user-auth routes
  - `apps/web/src/app/actions/campaigns.ts`: dashboard config actions
- `packages/data/`: shared schema/client/repos for runtime DB access

## Local development

Install dependencies:
- `bun install`

Run database schema push from repo root:
- `bun db:push`

Run web app:
- `bun dev:web`

Run bot:
- `bun dev:bot`

## Environment variables

### Bot (`apps/bot/.env`)
Required:
- `DISCORD_TOKEN`
- `DATABASE_URL`
- `GOOGLE_GENERATIVE_AI_API_KEY`

Common optional/conditional:
- `DISCORD_APP_ID`
- `DEEPGRAM_API_KEY`
- `ASSEMBLYAI_API_KEY`
- `STT_PROVIDER`
- `TTS_PROVIDER`
- `TTS_VOICE`
- `TTS_VOICE_OPTIONS`
- `ELEVENLABS_API_KEY`
- `CARTESIA_API_KEY`
- `CARTESIA_BASE_URL`
- `INWORLD_API_KEY`
- `BOT_HTTP_PORT`

### Web (`apps/web/.env`)
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

## Data and migration workflow

Schema entrypoint used by web Drizzle config remains:
- `apps/web/src/db/schema.ts`

That file re-exports runtime schema from `packages/data` plus Better Auth schema.

Preferred commands from repo root:
- `bun db:push`
- `bun db:generate`
- `bun db:migrate`
- `bun db:studio`

Avoid manual edits inside `apps/web/drizzle/` unless intentionally fixing a migration.

## Engineering conventions

- Use Bun for installs/scripts.
- Use Biome for formatting/linting (`bun check`, `bun lint`, `bun format`).
- Keep changes scoped and avoid unnecessary monorepo restructuring.
- Keep runtime DB access in `packages/data` repos; do not duplicate query logic across bot/web.
- Do not log secrets.

## Deployment pointers

- `apps/web` deploy target: Vercel.
- `apps/bot` deploy target: Fly.io.
- Neon Postgres is shared by bot and web via `DATABASE_URL`.

## Quick quality checks before finish

- `bun check`
- `bun lint`
- `bun format`
- For behavior changes: validate `/grim start` → speech → `/grim stop` in a real Discord server.

## Common pitfalls

- If Deepgram `nova-3` is unavailable, switch model in bot STT config.
- Ensure Discord Message Content intent is enabled for mention-driven agent interactions.
- TTS playback requires `ffmpeg` on the host/container.
