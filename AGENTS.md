# dnd-scribe — Agent Guide

This repo is a Bun monorepo for a Discord-based D&D “scribe”:
- A Discord bot joins a voice channel, streams Opus audio to Deepgram Live, and receives transcribed text.
- A Next.js web app exposes API routes that store transcripts in Coolify-hosted Postgres via Drizzle and generate a session recap via Vercel AI SDK.

## How the system works (end-to-end)

1. User runs `/grim start` in a Discord server while connected to a voice channel.
2. Bot joins voice, calls the web API to create a DB session record.
3. For each speaking user, the bot opens a Deepgram Live connection and forwards Opus audio frames.
4. When Deepgram emits a *final* transcript chunk, the bot POSTs it to the web API for persistence.
5. User runs `/grim stop`; bot disconnects and queues the web API to summarize the session.

The “source of truth” is the database in `apps/web`:
- `sessions`: lifecycle/status for each recording session
- `transcripts`: ordered lines (speaker + content + timestamp)
- `summaries`: final recap text for a session
- `searchable_chunks`: campaign-scoped retrieval index (embeddings + full-text) that powers the agent's `searchCampaignHistory` tool

## Repo layout

- `package.json`: Bun workspaces + top-level scripts (preferred entrypoints)
- `apps/bot/`: Discord bot (Bun runtime; deploy target: Coolify)
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
  - body: `{ guildId: string, channelId: string, textChannelId: string }`
  - response: `{ sessionId: number, resumed: boolean, stopReminderAt: string, autoStopAt: string }`
- `POST /api/session/stop`
  - body: `{ sessionId: number, reason: "manual_command"|"stop_button"|"max_duration"|"expired_before_resume" }`
  - response: `{ success: true, stopped: boolean, status: string }`
- `POST /api/ingest`
  - body: `{ sessionId: number, speaker: string, speakerUserId?: string, text: string, timestamp?: string|number }`
  - response: `{ ok: true }`
  - `speakerUserId` is the speaker's Discord user ID (stable identity; `speaker` is just a display name)
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

## Game scheduling and recording deadlines

Weekly schedules live in `campaign_schedules`; durable reminder, auto-stop,
and summary work lives in `scheduled_jobs`. The always-running Coolify bot
polls authenticated job APIs and leases due rows transactionally. Keep job
handlers idempotent: deployments may overlap and expired leases are retried.

Recording deadlines are measured from the actual `sessions.started_at`, not
the scheduled game time. The bot reminds at three hours and must stop at four.
The local deadline timer is backed by the durable `session_auto_stop` job so a
container restart cannot remove the safety limit. Store recurrence timezones
as IANA names (for example `America/New_York`), never fixed offsets.

## LLM text generation (Vercel AI SDK)

Text generation runs through the Vercel AI SDK on **Claude Sonnet 5** (`@ai-sdk/anthropic`):
- The Discord agent (`apps/web/src/lib/agents/discord-agent.ts`) uses a `ToolLoopAgent`.
- Session summarization (`apps/web/src/app/api/summarize/route.ts`) uses `generateText`.

Shared model + provider config lives in `apps/web/src/lib/agents/claude.ts`. Sonnet 5
runs adaptive thinking; reasoning depth is tuned via `effort` (`AGENT_EFFORT` defaults to
`medium`, `SUMMARY_EFFORT` to `high`). Do NOT set `thinking.budgetTokens` — Sonnet 5 rejects it.
Requires `ANTHROPIC_API_KEY`. Image generation still uses `@ai-sdk/google` / `@ai-sdk/openai`.

If you switch models/providers, update `apps/web/src/lib/agents/claude.ts`, env var usage,
`apps/web/.env.example`, and any deployment docs in `README.md`.

## Campaign history search (RAG)

The Discord agent can recall details from any past session via the
`searchCampaignHistory` tool, backed by `searchable_chunks` and the code in
`apps/web/src/lib/search/`:
- `embeddings.ts`: OpenAI `text-embedding-3-small` (1536-dim) helpers; return
  `null` instead of throwing when `OPENAI_API_KEY` is unset so search degrades to
  keyword-only.
- `indexer.ts`: best-effort writers — `indexSession` (called from
  `/api/summarize`, plus debounced mid-session via `maybeIndexSession` from
  `/api/ingest`) and `indexMemory` (called from the `rememberFact` tool and
  the `createMemory` server action). Both are idempotent; session runs are
  serialized by a per-session advisory lock. `deleteMemory` removes the
  memory's chunk in the same transaction; keep index writes in sync with any
  new code path that creates/deletes memories or summaries.
- `search.ts`: hybrid retrieval — pgvector cosine + Postgres full-text
  (`websearch_to_tsquery`), fused with Reciprocal Rank Fusion. In-progress
  sessions' not-yet-indexed lines (above
  `sessions.last_indexed_transcript_id`) are chunked/embedded at query time
  and fused in as extra legs (`live-tail.ts`), so live sessions are
  searchable.

The web UI exposes the same retrieval at `/account/c/[id]/search`, via the
`searchCampaign` server action in `apps/web/src/app/actions/search.ts` (same
guild-admin access check as the other server actions).

Operational notes:
- The `0008` migration runs `CREATE EXTENSION IF NOT EXISTS vector`, so apply it
  with `bun db:migrate` (a plain `db:push` cannot create the extension or the
  HNSW/GIN indexes).
- Backfill existing data with `bun apps/web/scripts/backfill-search-index.ts`.
- Design notes: `docs/plans/2026-06-30-campaign-search-design.md`.

## Campaign entity graph (character tracking)

Formal tracking of PCs, NPCs, factions, and locations, extracted from sessions
into `players`, `entities`, `entity_aliases`, `entity_facts`, and
`extraction_runs`. Code lives in `apps/web/src/lib/extraction/`:
- `run.ts`: session-end orchestrator (`runExtraction`), triggered from
  `/api/summarize` after search indexing. Best-effort and idempotent per
  session; every attempt is recorded in `extraction_runs` with the raw LLM
  output for replay/debugging.
- `output-schema.ts`: zod schema + prompt (bump `PROMPT_VERSION` on material
  prompt changes). Uses AI SDK `generateText` + `Output.object` on Claude.
- `reconciler.ts`: pure, unit-tested. The LLM proposes observations with
  candidate matches; this is the ONLY writer to the graph and enforces the
  invariants (hallucinated-id rejection, merge redirects, tombstone refusal,
  no-op fact dedup). Don't add DB access here — keep it pure.
- `candidates.ts`: recall-oriented prefilter choosing which known entities the
  model sees. Not identity matching — that's the model's job.
- `facts are append-only`: the newest `entity_facts` row per (entity, key) is
  the current value; older rows are the revision history. DM edits are just
  rows with `source: "dm"` — never lock or overwrite.
- Suppress (tombstone) and merge (redirect) are set from the web UI
  (`/account/c/[id]/characters`); the reconciler respects both.
- The Discord agent reads the graph via the `lookupCampaignEntities` tool, and
  entities are indexed into `searchable_chunks` as `sourceType: "entity"`.
- Backfill old sessions: `bun apps/web/scripts/backfill-entity-extraction.ts`
  (one Claude call per session — try a single session id first).

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
- `apps/bot` is an always-running Docker application on Coolify (see `apps/bot/Dockerfile`).
- Database is Coolify-hosted Postgres via `DATABASE_URL`; avoid introducing another DB/storage layer unless explicitly requested.

## Quick quality checks before you finish

- `bun check` (Biome check)
- `bun lint` (Biome lint)
- `bun format` (write formatting)
- For behavior changes: run `bun dev:web` + `bun dev:bot` and validate `!scribe start/stop` end-to-end (requires real Discord + Deepgram creds).

## Common pitfalls

- `NEXT_API_URL` in `apps/bot/.env` must include `/api` (example: `http://localhost:3000/api`).
- Deepgram model availability varies by account/region; `apps/bot/src/index.ts` uses `model: "nova-3"`.
- Do not log secrets (tokens/keys) to the console or return them from API routes.
