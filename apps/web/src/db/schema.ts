import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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
  activeCampaignId: integer("active_campaign_id").references(() => campaigns.id),
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

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  sessions: many(sessions),
  memories: many(memories),
  chatMessages: many(chatMessages),
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

export * from "./better-auth-schema";
