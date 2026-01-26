# Discord Bot Memory System

## Overview

Enable Grimoire (the Discord bot) to remember things beyond voice transcripts, including facts users explicitly ask it to remember and important information it encounters in @mention conversations.

## Goals

- Store explicit memories (lore, characters, rules) that users ask Grimoire to remember
- Store conversation history from @mention interactions
- Load relevant context into the agent so Grimoire can reference past knowledge
- Keep memories scoped to campaigns for clean separation between game worlds

## Non-Goals (Future Phases)

- Forget/update memory commands
- RAG/semantic search for conversations, transcripts, or memories
- Memory management UI in the web app
- Configurable recency window per campaign

## Data Model

### `memories` table

Stores explicit facts Grimoire remembers, campaign-scoped.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `campaignId` | uuid (FK) | References `campaigns.id` |
| `content` | text | The fact, e.g., "Lord Vex rules from the Obsidian Tower" |
| `category` | enum | One of: `lore`, `character`, `rule`, `meta`, `other` |
| `source` | text (nullable) | Who told Grimoire, e.g., "Sarah" |
| `createdAt` | timestamp | When the memory was created |

### `chatMessages` table

Stores conversation history from @mention interactions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `campaignId` | uuid (FK) | References `campaigns.id` |
| `guildId` | text | Discord guild ID |
| `channelId` | text | Discord channel ID |
| `userId` | text | Discord user ID |
| `displayName` | text | Human-readable name |
| `content` | text | Message content |
| `isBot` | boolean | True for Grimoire's responses |
| `createdAt` | timestamp | When the message was sent |

## Agent Tool: `rememberFact()`

New tool for the Discord agent to store memories.

```typescript
rememberFact({
  content: string,
  category: "lore" | "character" | "rule" | "meta" | "other",
  source?: string  // defaults to message sender's displayName
})
```

The agent calls this tool:
- When users explicitly ask ("remember that the dragon's name is Scorax")
- When it autonomously decides something is worth keeping

The tool inserts directly into the `memories` table via Drizzle and returns confirmation.

## Context Loading

Update `getCampaignContext()` to include:

- Everything currently returned (campaign info, recent sessions, summaries, latest transcripts)
- **All memories** for the active campaign (low volume, load all)
- **Last 25 chat messages** for the active campaign

## API Flow

All persistence happens inside `/api/agent/discord`:

1. **On request:** Store the user's incoming message in `chatMessages`
2. **During agent run:** `rememberFact()` tool inserts directly into `memories` table
3. **On finish:** AI SDK's `onFinish` hook stores Grimoire's response in `chatMessages`

No new public API endpoints needed. The bot flow remains unchanged.

## System Prompt Updates

### Memory Categories

Guidance for when to use each category:

- `character` — Player characters, NPCs, their traits/relationships
- `lore` — World history, places, organizations, events
- `rule` — House rules, table agreements, homebrew mechanics
- `meta` — Scheduling, player preferences, out-of-game info
- `other` — Anything that doesn't fit above

### Autonomous Memory Behavior

- Remember names of characters, NPCs, places introduced in conversation
- Remember relationships and affiliations stated as facts
- Don't remember jokes, casual chatter, questions, or speculation
- When uncertain, err toward not remembering—users can ask explicitly

## Edge Cases

### No Active Campaign

If a user @mentions Grimoire but no campaign is selected for the guild:
- Don't store chat messages or memories
- Grimoire responds but warns: "I have no campaign to remember this in. Use `/campaign select` to activate one."

## Implementation

### New Files

- `apps/web/src/lib/agents/tools/remember-fact.ts` — Tool implementation

### Modified Files

- `apps/web/src/db/schema.ts` — Add `memories` and `chatMessages` tables with relations
- `apps/web/src/lib/agents/discord-agent.ts` — Add `rememberFact` tool, update context loading, add `onFinish` hook
- `apps/web/src/app/api/agent/discord/route.ts` — Store incoming user message before agent runs

### Database Migration

One migration adding both tables with foreign keys to `campaigns`.
