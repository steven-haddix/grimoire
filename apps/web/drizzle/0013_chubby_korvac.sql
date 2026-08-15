CREATE TABLE "campaign_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"guild_id" text NOT NULL,
	"announcement_channel_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"local_time" text NOT NULL,
	"time_zone" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_occurrence_at" timestamp with time zone NOT NULL,
	"created_by_discord_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_schedules_campaign_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"schedule_id" integer,
	"session_id" integer,
	"run_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "scheduled_jobs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "text_channel_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ended_reason" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stop_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "auto_stop_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_schedules" ADD CONSTRAINT "campaign_schedules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_schedule_id_campaign_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."campaign_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_schedules_next_occurrence_idx" ON "campaign_schedules" USING btree ("enabled","next_occurrence_at");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_due_idx" ON "scheduled_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_session_idx" ON "scheduled_jobs" USING btree ("session_id");--> statement-breakpoint
DELETE FROM "summaries" a
USING "summaries" b
WHERE a."session_id" = b."session_id" AND a."id" < b."id";--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_session_unique" UNIQUE("session_id");
