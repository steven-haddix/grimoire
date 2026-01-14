import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
	id: serial("id").primaryKey(),
	guildId: text("guild_id").notNull(),
	channelId: text("channel_id").notNull(),
	status: text("status").notNull().default("active"),
	startedAt: timestamp("started_at").notNull().defaultNow(),
	endedAt: timestamp("ended_at"),
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
