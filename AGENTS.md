# dnd-scribe — Agent Guide

This repo is a Bun monorepo for a Discord-based D&D “scribe”:
- A Discord bot joins a voice channel, streams Opus audio to Deepgram Live, and receives transcribed text.
- A Next.js web app exposes API routes that store transcripts in Neon (Postgres via Drizzle) and generate a session recap via Vercel AI SDK.

## How the system works (end-to-end)

1. User types `!scribe start` in a Discord server while connected to a voice channel.
2. Bot joins voice, calls the web API to create a DB session record.
3. For each speaking user, the bot opens a Deepgram Live connection and forwards Opus audio frames.
4. When Deepgram emits a *final* transcript chunk, the bot POSTs it to the web API for persistence.
5. User types `!scribe stop`; bot disconnects and triggers the web API to summarize the session.

The “source of truth” is the database in `apps/web`:
- `sessions`: lifecycle/status for each recording session
- `transcripts`: ordered lines (speaker + content + timestamp)
- `summaries`: final recap text for a session

## Repo layout

- `package.json`: Bun workspaces + top-level scripts (preferred entrypoints)
- `apps/bot/`: Discord bot (Bun runtime; deploy target: Fly.io)
  - `apps/bot/src/index.ts`: bot commands, voice capture, Deepgram streaming, API calls
- `apps/web/`: Next.js app + API (deploy target: Vercel)
  - `apps/web/src/app/api/session/start/route.ts`: creates a session row
  - `apps/web/src/app/api/ingest/route.ts`: inserts transcript lines
  - `apps/web/src/app/api/summarize/route.ts`: reads transcripts, generates recap, writes summary + completes session
  - `apps/web/src/db/schema.ts`: Drizzle schema (tables)
  - `apps/web/drizzle/`: generated migrations
- `biome.json`: formatting/linting rules (Biome is the canonical formatter)

## Local development (do this first)

Install dependencies:
- `bun install`

Start the web app (in one terminal):
- `bun dev:web`

Set up the web env (copy and fill):
- `apps/web/.env.example` → `apps/web/.env`

Initialize/update the database schema (from repo root):
- `bun db:push`

Start the bot (in another terminal):
- `bun dev:bot`

Set up the bot env (copy and fill):
- `apps/bot/.env.example` → `apps/bot/.env`

## Environment variables and auth

`BOT_SECRET` is a shared secret used to authenticate bot → web API calls:
- Bot sends header `x-bot-secret: $BOT_SECRET`
- Web API rejects requests if header doesn’t match `process.env.BOT_SECRET`

Do not weaken or remove this check. If you change the auth mechanism, update:
- bot request headers in `apps/bot/src/index.ts`
- web auth checks in every API route under `apps/web/src/app/api/*/route.ts`
- both `.env.example` files and `README.md`

## API contracts (bot ↔ web)

All routes expect `x-bot-secret`.

- `POST /api/session/start`
  - body: `{ guildId: string, channelId: string }`
  - response: `{ sessionId: number }`
- `POST /api/ingest`
  - body: `{ sessionId: number, speaker: string, text: string, timestamp?: string|number }`
  - response: `{ ok: true }`
- `POST /api/summarize`
  - body: `{ sessionId: number|string }`
  - response: `{ success: true, summary: string }`

If you change payload shapes, update both sides in the same PR.

## Database + Drizzle workflow

Schema lives in `apps/web/src/db/schema.ts`.

Preferred commands from repo root:
- `bun db:push` (push schema to DB)
- `bun db:generate` (generate migrations)
- `bun db:migrate` (run migrations)
- `bun db:studio` (open Drizzle Studio)

Avoid manual edits inside `apps/web/drizzle/` unless you are intentionally fixing a broken migration.

## Summarization (Vercel AI SDK)

Summarization is implemented in `apps/web/src/app/api/summarize/route.ts` using Vercel AI SDK’s `generateText`.
If you switch models/providers (Google/OpenAI/etc), update:
- provider code and env var usage
- `apps/web/.env.example`
- any deployment docs in `README.md`

## Engineering conventions (stay consistent)

- Use Bun for scripts and installs; do not introduce `npm`, `pnpm`, or new build tools.
- Keep Bun versions compatible with `packageManager` in `package.json` (currently Bun 1.3.x).
- Use Biome for formatting/linting (`bun check`, `bun lint`, `bun format`).
- Keep changes small and scoped; do not restructure the monorepo without an explicit request.
- Prefer the existing runtime patterns:
  - Next.js route handlers use `NextResponse` and explicit input parsing/type guards (no new validation library unless asked).
  - Bot uses `discord.js` + `@discordjs/voice` receiver; be careful with cleanup/concurrency (one stream per user per guild).

## Deployment pointers (so you don’t design the wrong thing)

- `apps/web` is intended for Vercel (Next.js app router + server routes).
- `apps/bot` is intended for Fly.io (see `apps/bot/fly.toml` and `apps/bot/Dockerfile`).
- Database is Neon Postgres via `DATABASE_URL`; avoid introducing another DB/storage layer unless explicitly requested.

## Quick quality checks before you finish

- `bun check` (Biome check)
- `bun lint` (Biome lint)
- `bun format` (write formatting)
- For behavior changes: run `bun dev:web` + `bun dev:bot` and validate `!scribe start/stop` end-to-end (requires real Discord + Deepgram creds).

## Common pitfalls

- `NEXT_API_URL` in `apps/bot/.env` must include `/api` (example: `http://localhost:3000/api`).
- Deepgram model availability varies by account/region; `apps/bot/src/index.ts` uses `model: "nova-3"`.
- Do not log secrets (tokens/keys) to the console or return them from API routes.
