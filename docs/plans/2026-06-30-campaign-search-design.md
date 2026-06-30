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
| `search_vector` | tsvector (generated) | `to_tsvector('english', content)`, STORED |
| `created_at` | timestamp | When indexed |

Indexes: btree on `campaign_id`, `session_id`, `(source_type, source_id)`;
HNSW (`vector_cosine_ops`) on `embedding`; GIN on `search_vector`.

Requires the `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector` — in the
0008 migration; Neon supports pgvector on all plans).

## Retrieval (hybrid + RRF)

`searchCampaignHistory({ campaignId, query, limit })`:

1. **Semantic leg** — embed the query, order by cosine distance (`<=>`) over the
   HNSW index, scoped to the campaign.
2. **Keyword leg** — `plainto_tsquery('english', query)` against the GIN index,
   ranked by `ts_rank`.
3. **Fuse** the two ranked lists with Reciprocal Rank Fusion (`k = 60`). RRF
   avoids cross-modal score normalization and naturally handles one leg being
   empty (no embeddings → keyword-only, and vice versa).
4. **Enrich** with a human-friendly session number + date for provenance.

## Indexing

Best-effort writers in `lib/search/indexer.ts` (never throw):

- `indexSession(sessionId)` — summary + chunked transcripts. Called from
  `/api/summarize` after the recap is written. Idempotent (replaces the
  session's summary/transcript chunks).
- `indexMemory(memory)` — called from the agent's `rememberFact` tool right
  after insert, so new facts are searchable immediately. Idempotent per memory.

Transcripts are grouped into ~1500-char chunks (`chunkTranscriptLines`) so each
embedding stays focused but keeps surrounding context.

### Backfill

`bun apps/web/scripts/backfill-search-index.ts` indexes all existing sessions
and memories. Safe to re-run; re-run after setting `OPENAI_API_KEY` to add
embeddings to keyword-only rows.

## Agent integration

New `searchCampaignHistory` tool. System-prompt guidance steers the agent to
use it for questions about specifics from earlier sessions (and to use
`getCampaignContext` for recent/just-happened context). Results are mapped to
`{ source, session, date, speaker, content }` for the agent to weave into its
in-character reply, with instructions not to invent details when nothing is
found.

## New / modified files

- **New** `apps/web/src/lib/search/embeddings.ts`, `indexer.ts`, `search.ts`
- **New** `apps/web/scripts/backfill-search-index.ts`
- **New** `apps/web/drizzle/0008_add_searchable_chunks.sql`
- **Modified** `apps/web/src/db/schema.ts` (table + relations)
- **Modified** `apps/web/src/lib/agents/discord-agent.ts` (tool + prompt + index on remember)
- **Modified** `apps/web/src/app/api/summarize/route.ts` (index on summarize)

## Future work

- Index `chat_messages` (@mention conversations) too.
- Re-index on transcript edits / summary regeneration.
- A worker queue for embedding instead of inline at summarize-time.
- Surface search in the web admin UI.
