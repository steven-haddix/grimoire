# Campaign History Search

## Overview

Give Grimoire (the Discord agent) the ability to recall details from **any**
past session, not just the handful in its recent-context window. Before this,
`getCampaignContext` loaded summaries for the last 5–10 sessions and raw
transcripts for the latest session only — so a question like "what was the
innkeeper's name back in session 2?" was unanswerable across a long campaign.

This adds a hybrid (semantic + keyword) retrieval layer over the whole campaign
and a `searchCampaignHistory` agent tool that queries it. It is the realization
of the "RAG/semantic search" item listed as a future non-goal in
`2026-01-25-bot-memory-design.md`.

## Goals

- Search every past session's transcripts and summaries, plus remembered facts.
- Match by meaning (paraphrases) *and* by exact terms (proper nouns).
- Degrade gracefully when embeddings are unavailable (keyword-only).
- Keep indexing best-effort so it can never break ingest/summarize/remember.

## Data model

### `searchable_chunks` table

A unified, campaign-scoped retrieval index. One row per embeddable chunk.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `campaign_id` | integer (FK → campaigns, cascade) | Scopes every search |
| `session_id` | integer (FK → sessions, cascade, nullable) | Provenance; null for memories |
| `source_type` | text | `summary` \| `transcript` \| `memory` |
| `source_id` | integer (nullable) | Originating summary/memory id, or session id for transcript chunks; used for idempotent re-index |
| `chunk_index` | integer | Position within the source (0 for single-chunk sources) |
| `speaker` | text (nullable) | Speaker when a transcript chunk is single-speaker |
| `content` | text | The chunk text |
| `embedding` | vector(1536) (nullable) | OpenAI `text-embedding-3-small`; null when embedding unavailable |
| `embedding_provider` | text (nullable) | Provider that produced `embedding` (e.g. `openai`) |
| `embedding_model` | text (nullable) | Model id (e.g. `text-embedding-3-small`) |
| `embedding_dimensions` | integer (nullable) | Vector length, for migration/auditing |
| `search_vector` | tsvector (generated) | `to_tsvector('english', content)`, STORED |
| `created_at` | timestamp | When indexed |

Indexes: btree on `campaign_id`, `session_id`, `(source_type, source_id)`;
HNSW (`vector_cosine_ops`) on `embedding`; GIN on `search_vector`.

Requires the `vector` extension. The 0008 migration runs
`CREATE EXTENSION IF NOT EXISTS vector`, but on self-hosted Postgres (Coolify/VM)
pgvector must be **installed on the server first** — vanilla Postgres doesn't
bundle it. Use a pgvector-enabled image (e.g. `pgvector/pgvector:pg16`) or
install the OS package (`postgresql-NN-pgvector`); otherwise the migration fails
with `could not open extension control file ".../vector.control"`.

## Retrieval (hybrid + RRF)

`searchCampaignHistory({ campaignId, query, limit })`:

1. **Semantic leg** — embed the query, order by cosine distance (`<=>`) over the
   HNSW index, scoped to the campaign.
2. **Keyword leg** — `websearch_to_tsquery('english', query)` against the GIN
   index (supports quoted phrases / OR / -exclusion in user-typed queries and
   never raises on malformed input), ranked by `ts_rank` with length
   normalization so long transcript chunks don't outrank short memories.
3. **Fuse** the two ranked lists with Reciprocal Rank Fusion (`k = 60`). RRF
   avoids cross-modal score normalization and naturally handles one leg being
   empty (no embeddings → keyword-only, and vice versa).
4. **Enrich** with a human-friendly session number + date for provenance.

## Indexing

Best-effort writers in `lib/search/indexer.ts` (never throw):

- `indexSession(sessionId)` — chunked summary + chunked transcripts. Scheduled
  from `/api/summarize` via `after()` so the embedding calls run *after* the
  response flushes and add no latency to the summarize request. Idempotent.
- `indexMemory(memory)` — scheduled from the agent's `rememberFact` tool via
  `after()`, so "remember that…" never stalls the Discord reply on an embedding
  round-trip. Idempotent per memory. Also scheduled from the web UI's
  `createMemory` server action; `deleteMemory` removes the memory's chunk in
  the same transaction as the memory row so a "forgotten" fact can't keep
  surfacing in search.

Both chunk before embedding: transcripts via `chunkTranscriptLines` (consecutive
lines grouped to ~1500 chars) and summaries via `chunkText` (split on section /
paragraph boundaries) — the latter so a multi-section recap ("Plot, Combat,
Loot") doesn't collapse into one diluted vector. Pure chunking/fusion logic
lives in `chunking.ts` / `fusion.ts` (no DB deps) and is unit-tested.

Each writer embeds **before** mutating the index and wraps the delete+insert in a
`db.transaction()`, so a failed/slow embedding or a mid-write crash can't leave a
session unsearchable. (Transactions require the node-postgres driver, which is
what self-hosted Postgres resolves to; the legacy neon-http path has no
transaction support.)

### Embedding provenance & migrations

Every embedded row records `embedding_provider`, `embedding_model`, and
`embedding_dimensions` (from `embeddingMeta()` in `embeddings.ts`). Embeddings
from different models occupy different vector spaces and are not comparable, so:

- The semantic search leg filters on `embedding_model = <active model>`, meaning
  rows embedded by an older model are simply ignored by vector search (they still
  surface via keyword search) until re-embedded — no silently-wrong results.
- To switch providers/models: bump `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` (and
  `EMBEDDING_DIMENSIONS` if the size changes — note the `vector(N)` column is
  fixed-width, so a different dimensionality needs a column/table change), then
  re-run the backfill. `SELECT ... WHERE embedding_model <> '<new model>'`
  pinpoints exactly which rows still need re-embedding, so the migration can run
  incrementally and be verified.

### Backfill

`bun apps/web/scripts/backfill-search-index.ts` indexes all existing sessions
and memories. Safe to re-run; re-run after setting `OPENAI_API_KEY` to add
embeddings to keyword-only rows.

## Web UI integration

`/account/c/[id]/search` gives DMs the same hybrid retrieval in the browser.
The page calls the `searchCampaign` server action (`app/actions/search.ts`),
which enforces the same campaign access check as the other server actions
(signed-in user must be an admin of the campaign's Discord guild) before
delegating to `searchCampaignHistory`. Results carry a source badge
(summary / transcript / memory), session number + date, speaker when known,
and link to the session detail or memories page.

Note the access model: only Discord guild *admins* can use the web app today.
Opening search to players means widening `getUserAdminGuilds`-based checks to
a member/role model — an app-wide auth decision, not a search-specific one.

## Agent integration

New `searchCampaignHistory` tool. System-prompt guidance steers the agent to
use it for questions about specifics from earlier sessions (and to use
`getCampaignContext` for recent/just-happened context). Results are mapped to
`{ source, session, date, speaker, content }` for the agent to weave into its
in-character reply, with instructions not to invent details when nothing is
found.

## New / modified files

- **New** `apps/web/src/lib/search/embeddings.ts`, `chunking.ts`, `fusion.ts`,
  `indexer.ts`, `search.ts` (+ `chunking.test.ts`, `fusion.test.ts`)
- **New** `apps/web/scripts/backfill-search-index.ts`
- **New** `apps/web/drizzle/0008_add_searchable_chunks.sql`
- **Modified** `apps/web/src/db/schema.ts` (table + relations)
- **Modified** `apps/web/src/lib/agents/discord-agent.ts` (tool + prompt + index on remember)
- **Modified** `apps/web/src/app/api/summarize/route.ts` (index on summarize)

## Future work

- Index `chat_messages` (@mention conversations) too.
- Re-index on transcript edits / summary regeneration.
- Emit metrics on embedding/index failures (currently logged but unmetered), so
  a silent degradation to keyword-only is observable.
- A durable job queue with retries (the current `after()` deferral keeps work
  off the request path but doesn't survive a process restart mid-embed).
- Skip re-embedding unchanged chunks (content hash) to avoid re-embedding a whole
  session on every re-summarize.
- Index in-progress sessions (today transcripts are only indexed when
  `/api/summarize` runs at session end, so a live session isn't searchable yet).
- Player-facing access (see Web UI integration — requires a member/role auth
  model beyond guild admins).
- Fuzzy matching for misspelled proper nouns (`pg_trgm` similarity as a third
  retrieval leg) — fantasy names are frequent and English stemming won't help.
