# Ask Grimoire — Web Chat

## Overview

Bring the Grimoire agent to the web app so a DM can do conversational Q&A over
their campaign sessions from the browser, not just Discord. Today the web UI
exposes the agent's *retrieval* (the `/account/c/[id]/search` page) but not the
agent itself: there is no way to ask "what happened last session?" or "who was
the innkeeper in Barrowmoor?" and get a synthesized, in-character answer with
follow-ups.

This adds a dedicated **Ask Grimoire** chat page per campaign, backed by the
same Claude Sonnet 5 `ToolLoopAgent` brain the Discord bot uses — same persona,
same campaign-recall tools — delivered over a streaming chat endpoint.

## Goals

- Conversational Q&A over a campaign's sessions, summaries, entities, and
  memories from the web UI.
- Reuse the existing agent brain: persona + read-only campaign tools
  (`getCampaignContext`, `lookupCampaignEntities`, `searchCampaignHistory`)
  shared with the Discord agent, not duplicated.
- Streaming responses with visible tool activity (multi-step agent runs take
  10–30s; a dead spinner is unacceptable chat UX).
- Conversations persist per user per campaign (reload-safe), stored separately
  from the Discord `chat_messages` stream.
- Answers cite sessions and link to their pages in the web app.

## Non-goals (v1)

- Floating chat drawer on other pages (the dedicated page can be wrapped in a
  drawer later).
- Multiple named threads per campaign — one rolling conversation per user per
  campaign.
- Write tools from the web: no `rememberFact`, no `illustrate`. Q&A only.
- Sharing conversation history with Discord (the agent can still *read* recent
  Discord chatter via `getCampaignContext`, but web messages never enter the
  Discord stream and vice versa).
- Rate limiting / usage caps — the page is gated to guild admins, the same
  trust level as the search page.

## Architecture

### 1. Shared agent core (refactor of `discord-agent.ts`)

New module `apps/web/src/lib/agents/grimoire-core.ts` extracts what both
channels share:

- **`GRIMOIRE_PERSONA`** — the personality/memory instruction lines (sardonic
  sentient spellbook, references past events, never breaks character). The
  channel-specific delivery rules (Discord's "1–3 sentences", reply/say/
  illustrate tool guidance) stay in `discord-agent.ts`; the web route adds its
  own delivery rules.
- **`createCampaignTools({ campaignId })`** — factory returning the three
  read-only tools, parameterized by an explicit campaign id:
  - `getCampaignContext` — `loadCampaignContext` moves here and takes
    `campaignId` directly (the Discord agent already resolves
    guild → active campaign before building tools; it passes the id in).
  - `lookupCampaignEntities` — unchanged logic.
  - `searchCampaignHistory` — result mapping gains `sessionId` alongside the
    existing session number/date/speaker/content, so the web agent can emit
    real links. Harmless extra field for the Discord agent.

The Discord agent keeps its Discord-only tools (`reply`, `say`, `illustrate`,
`rememberFact`) and its behavior; this is a refactor-in-place with no
functional change on the Discord side.

### 2. Chat endpoint — `POST /api/chat`

`apps/web/src/app/api/chat/route.ts`, authenticated as a *user* route (better-
auth session + guild-admin campaign check, same logic as the `searchCampaign`
server action) — **not** the `x-bot-secret` scheme used by bot routes.

Request: `{ campaignId, messages }` (the `useChat` UI-message array; the
client transport appends `campaignId`).

The route:

1. Validates the session and campaign access; rejects otherwise.
2. Trims history to the last 20 messages for model context.
3. Builds a `ToolLoopAgent` with `claudeModel`, `claudeProviderOptions`
   (`AGENT_EFFORT`, default `medium`), `stopWhen: isStepCount(6)`, the shared
   campaign tools, and telemetry `functionId: "web-chat-agent"`.
4. Web delivery instructions on top of `GRIMOIRE_PERSONA`: answer directly in
   streamed text (no `reply` tool — the text *is* the reply), markdown
   allowed, cite sessions by number and link them as
   `/account/c/{campaignId}/sessions/{sessionId}` using the ids the search
   tool returns, longer answers than Discord are fine on a reading surface,
   admit when the record has nothing rather than inventing details.
5. Streams the agent run back as a UI message stream
   (`toUIMessageStreamResponse`), so tool-call activity is visible client-side.
6. Persists the incoming user message immediately and the assistant's final
   text when the stream finishes (`onFinish`). Persistence is best-effort —
   a failed write never kills the stream.

Nothing here is platform-specific: streaming route handlers work the same in
the Docker/Coolify deployment as anywhere else.

### 3. Persistence

New table `web_chat_messages`:

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `campaign_id` | integer (FK → campaigns, cascade) | Scope |
| `user_id` | text | better-auth user id (per-user conversation) |
| `role` | text | `user` \| `assistant` |
| `content` | text | User text, or the assistant's final markdown. Tool-call intermediates are not persisted. |
| `created_at` | timestamp | default now |

Index: btree on `(campaign_id, user_id, created_at)`.

The page's server component loads the last 50 rows for `(campaignId, userId)`
and converts them to initial `UIMessage`s (one text part each). A
`clearWebChat(campaignId)` server action (same access check) deletes the
user's rows for that campaign — surfaced in the UI as "burn the pages".

### 4. UI — `/account/c/[id]/chat`

Follows the search page's structure: a server component (`page.tsx`) does
auth + campaign fetch + history load and renders a client `chat-view.tsx`.

- **Client:** `useChat` from `@ai-sdk/react` (new dependency — the only one),
  with a transport pointing at `/api/chat` that includes `campaignId`.
  Messages render with the already-installed `react-markdown` + `remark-gfm`.
- **Style:** existing grimoire tokens (`--ink-2`, `--bone`, `--copper`, serif
  display heading, `t-eyebrow`/`t-meta` classes) — visually a sibling of the
  search page.
- **Tool activity:** while the agent is running tool steps, show an
  in-character status line ("Leafing through the record…").
- **Empty state:** 3–4 static clickable starter questions ("What happened
  last session?", "Recap the campaign so far", "Who owes whom money?").
  Entity-seeded suggestions are deferred.
- **Input:** textarea with submit-on-Enter, capped at 2,000 chars, disabled
  while a response streams.
- **Nav:** "Ask Grimoire" item in the campaign section of `side-nav.tsx`
  (nav item + `chat` added to the `parseScope` regex).

## Error handling

- Endpoint auth failures → 401/403 JSON; the client shows a toast.
- Stream/network errors → inline error bubble with a retry affordance, plus a
  `sonner` toast (matching the search page's pattern).
- Agent tool failures are already soft (tools return `ok: false` payloads);
  the model narrates gracefully in character.
- History persistence failures are logged, never fatal to the response.

## Testing

- Unit tests for the pure helpers that fall out of the refactor: DB-row →
  `UIMessage` conversion, history trimming, and the shared tool factory's
  result shapes.
- `bun check` / `bun lint` per repo convention.
- Manual end-to-end: `bun dev:web`, ask questions against a campaign with
  indexed sessions; verify streaming, tool-status display, persistence across
  reload, clear-conversation, and session links.
- Discord regression: verify the bot still answers in Discord after the
  `discord-agent.ts` refactor (same tools, same persona, unchanged behavior).

## Future (explicitly deferred)

- Floating drawer / global chat affordance.
- Multiple threads and thread titles.
- `rememberFact` and `illustrate` from the web.
- Retrieval-result side panel (show the chunks behind an answer).
