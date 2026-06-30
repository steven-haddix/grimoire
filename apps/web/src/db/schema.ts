import { relations, type SQL, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
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

// Dimensionality of OpenAI `text-embedding-3-small` vectors. Kept here so the
// schema and the embedding helper can never drift apart.
export const EMBEDDING_DIMENSIONS = 1536;

export type SearchableChunkSource = "summary" | "transcript" | "memory";

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
    // "summary" | "transcript" | "memory"
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
