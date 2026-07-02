import { relations, type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
  vector,
} from "drizzle-orm/pg-core";

// Postgres bytea — stored as a Node Buffer in TS land.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

// Postgres tsvector for full-text search. Populated by a generated column, so
// we never write to it directly from application code.
const tsvector = customType<{ data: string; default: false }>({
  dataType() {
    return "tsvector";
  },
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  // Live-search bookkeeping. `lastIndexedAt` debounces mid-session re-index
  // runs (set when a run is claimed, before indexing starts).
  // `lastIndexedTranscriptId` is the exact high-water mark of transcript rows
  // captured by the last index run; lines above it are the "live tail" that
  // search covers at query time without an index.
  lastIndexedAt: timestamp("last_indexed_at"),
  lastIndexedTranscriptId: integer("last_indexed_transcript_id"),
});

export const botGuilds = pgTable("bot_guilds", {
  guildId: text("guild_id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  activeCampaignId: integer("active_campaign_id").references(
    () => campaigns.id,
  ),
  installed: boolean("installed").notNull().default(true),
  installedAt: timestamp("installed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const transcripts = pgTable("transcripts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  speaker: text("speaker").notNull(),
  // Discord user ID of the speaker. `speaker` is a mutable display name; this
  // is the stable identity used to link transcript lines to players/PCs.
  // Nullable because rows ingested before this column existed have no ID.
  speakerDiscordUserId: text("speaker_discord_user_id"),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const summaries = pgTable("summaries", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memories = pgTable("memories", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  category: text("category").notNull(), // lore, character, rule, meta, other
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  userId: text("user_id").notNull(),
  displayName: text("display_name").notNull(),
  content: text("content").notNull(),
  isBot: boolean("is_bot").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const illustrations = pgTable("illustrations", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => sessions.id, {
    onDelete: "set null",
  }),
  prompt: text("prompt").notNull(),
  userPrompt: text("user_prompt"),
  caption: text("caption"),
  mimeType: text("mime_type").notNull(),
  data: bytea("data").notNull(),
  width: integer("width"),
  height: integer("height"),
  source: text("source").notNull().default("web"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Campaign entity graph
//
// Formal tracking of who/what exists in a campaign: player characters, NPCs,
// factions, and locations, plus the real humans behind the PCs. Populated by
// the session-end extraction pipeline (`@/lib/extraction`) — the LLM proposes
// observations, a deterministic reconciler is the only writer. Facts are
// append-only, so the graph is a living record with built-in revision history
// rather than a static wiki.
// ---------------------------------------------------------------------------

// The real humans at the table, keyed by stable Discord user ID (display
// names drift; IDs don't). One row per human per campaign.
export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    discordUserId: text("discord_user_id").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("players_campaign_user_unique").on(
      table.campaignId,
      table.discordUserId,
    ),
  ],
);

export const ENTITY_TYPES = ["pc", "npc", "faction", "location"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// A tracked thing in the campaign world. Rows carry identity only — every
// mutable detail (description, status, last known location, …) lives in
// `entity_facts` so nothing is ever overwritten, only superseded.
export const entities = pgTable(
  "entities",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    // "pc" | "npc" | "faction" | "location"
    type: text("type").notNull(),
    // Canonical display name. Alternate spellings/nicknames live in
    // `entity_aliases`.
    name: text("name").notNull(),
    // For PCs: the human who plays them. Assigned manually in the web UI
    // (extraction can rarely infer this reliably from speech).
    playerId: integer("player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    lastSeenSessionId: integer("last_seen_session_id").references(
      () => sessions.id,
      { onDelete: "set null" },
    ),
    // Tombstone: a DM deleted this entity (e.g. an extraction hallucination).
    // The reconciler refuses to recreate suppressed entities, otherwise they
    // resurrect on the next session's extraction pass.
    suppressedAt: timestamp("suppressed_at"),
    // Merge redirect: this entity was a duplicate of another. The reconciler
    // follows redirects so new observations land on the survivor.
    mergedIntoEntityId: integer("merged_into_entity_id").references(
      (): AnyPgColumn => entities.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("entities_campaign_idx").on(table.campaignId),
    index("entities_campaign_type_idx").on(table.campaignId, table.type),
  ],
);

// Alternate names for an entity: nicknames, titles, and the ASR misspellings
// that voice transcription inevitably produces ("Thal Drin" → Thaldrin).
// Candidate selection and the agent's lookup tool match against these.
export const entityAliases = pgTable(
  "entity_aliases",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    // Session whose extraction produced this alias; null for DM-added ones.
    // Lets a re-run of one session's extraction replace exactly its own rows.
    sourceSessionId: integer("source_session_id").references(
      () => sessions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("entity_aliases_entity_alias_unique").on(
      table.entityId,
      table.alias,
    ),
  ],
);

export const ENTITY_FACT_SOURCES = ["extractor", "dm", "backfill"] as const;
export type EntityFactSource = (typeof ENTITY_FACT_SOURCES)[number];

// Append-only key/value facts about an entity. The current value of a key is
// the newest row for (entityId, key); older rows are the revision history.
// DM edits and extractor updates are both just new rows — nothing is locked,
// nothing is lost.
export const entityFacts = pgTable(
  "entity_facts",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    // e.g. "description", "status", "last_known_location", "appearance",
    // "goal". Free-form — the extractor is prompted with a preferred set but
    // new keys are allowed.
    key: text("key").notNull(),
    value: text("value").notNull(),
    // Extractor confidence in [0, 1]; null for DM edits (implicitly trusted).
    confidence: real("confidence"),
    // "extractor" | "dm" | "backfill"
    source: text("source").notNull(),
    sourceSessionId: integer("source_session_id").references(
      () => sessions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("entity_facts_entity_key_idx").on(table.entityId, table.key),
  ],
);

// One row per extraction attempt. Stores the raw LLM output so bad graph
// state can always be traced to either a bad proposal or a reconciler bug,
// and so a session can be re-reconciled after a fix without re-paying the
// model call.
export const extractionRuns = pgTable(
  "extraction_runs",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    // "pending" | "succeeded" | "failed"
    status: text("status").notNull().default("pending"),
    rawOutput: jsonb("raw_output"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [index("extraction_runs_session_idx").on(table.sessionId)],
);

// Dimensionality of OpenAI `text-embedding-3-small` vectors. Kept here so the
// schema and the embedding helper can never drift apart.
export const EMBEDDING_DIMENSIONS = 1536;

export type SearchableChunkSource =
  | "summary"
  | "transcript"
  | "memory"
  | "entity";

// Unified retrieval index for campaign history. Each row is a small, embeddable
// chunk of text (a session summary, a slice of a transcript, or a memory) plus
// a vector embedding and a full-text search vector. The Discord agent searches
// this table to recall details from sessions far outside its recent-context
// window. `embedding` is nullable so rows survive even if embedding generation
// fails — keyword search still works in that case.
export const searchableChunks = pgTable(
  "searchable_chunks",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sessionId: integer("session_id").references(() => sessions.id, {
      onDelete: "cascade",
    }),
    // "summary" | "transcript" | "memory" | "entity"
    sourceType: text("source_type").notNull(),
    // id of the originating summary/memory row, or the session id for transcript
    // chunks. Used to make re-indexing idempotent.
    sourceId: integer("source_id"),
    // position of this chunk within its source (0 for single-chunk sources).
    chunkIndex: integer("chunk_index").notNull().default(0),
    speaker: text("speaker"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    // Provenance of `embedding`, so a future embedding-service/model switch can
    // identify exactly which rows to re-embed and search can avoid mixing
    // incomparable vector spaces. All null when the row has no embedding
    // (keyword-only).
    embeddingProvider: text("embedding_provider"),
    embeddingModel: text("embedding_model"),
    embeddingDimensions: integer("embedding_dimensions"),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', "content")`,
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("searchable_chunks_campaign_idx").on(table.campaignId),
    index("searchable_chunks_session_idx").on(table.sessionId),
    index("searchable_chunks_source_idx").on(table.sourceType, table.sourceId),
    index("searchable_chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    index("searchable_chunks_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
  ],
);

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  sessions: many(sessions),
  memories: many(memories),
  chatMessages: many(chatMessages),
  illustrations: many(illustrations),
  searchableChunks: many(searchableChunks),
  players: many(players),
  entities: many(entities),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [players.campaignId],
    references: [campaigns.id],
  }),
  characters: many(entities),
}));

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [entities.campaignId],
    references: [campaigns.id],
  }),
  player: one(players, {
    fields: [entities.playerId],
    references: [players.id],
  }),
  lastSeenSession: one(sessions, {
    fields: [entities.lastSeenSessionId],
    references: [sessions.id],
  }),
  mergedInto: one(entities, {
    fields: [entities.mergedIntoEntityId],
    references: [entities.id],
    relationName: "entity_merges",
  }),
  aliases: many(entityAliases),
  facts: many(entityFacts),
}));

export const entityAliasesRelations = relations(entityAliases, ({ one }) => ({
  entity: one(entities, {
    fields: [entityAliases.entityId],
    references: [entities.id],
  }),
}));

export const entityFactsRelations = relations(entityFacts, ({ one }) => ({
  entity: one(entities, {
    fields: [entityFacts.entityId],
    references: [entities.id],
  }),
}));

export const extractionRunsRelations = relations(extractionRuns, ({ one }) => ({
  session: one(sessions, {
    fields: [extractionRuns.sessionId],
    references: [sessions.id],
  }),
  campaign: one(campaigns, {
    fields: [extractionRuns.campaignId],
    references: [campaigns.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [sessions.campaignId],
    references: [campaigns.id],
  }),
  transcripts: many(transcripts),
  summaries: many(summaries),
}));

export const botGuildsRelations = relations(botGuilds, ({ one }) => ({
  activeCampaign: one(campaigns, {
    fields: [botGuilds.activeCampaignId],
    references: [campaigns.id],
  }),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  session: one(sessions, {
    fields: [transcripts.sessionId],
    references: [sessions.id],
  }),
}));

export const summariesRelations = relations(summaries, ({ one }) => ({
  session: one(sessions, {
    fields: [summaries.sessionId],
    references: [sessions.id],
  }),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [memories.campaignId],
    references: [campaigns.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [chatMessages.campaignId],
    references: [campaigns.id],
  }),
}));

export const illustrationsRelations = relations(illustrations, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [illustrations.campaignId],
    references: [campaigns.id],
  }),
  session: one(sessions, {
    fields: [illustrations.sessionId],
    references: [sessions.id],
  }),
}));

export const searchableChunksRelations = relations(
  searchableChunks,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [searchableChunks.campaignId],
      references: [campaigns.id],
    }),
    session: one(sessions, {
      fields: [searchableChunks.sessionId],
      references: [sessions.id],
    }),
  }),
);

export * from "./better-auth-schema";
