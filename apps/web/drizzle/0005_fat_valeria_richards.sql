CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_guilds" ADD COLUMN "active_campaign_id" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "campaign_id" integer;--> statement-breakpoint
ALTER TABLE "bot_guilds" ADD CONSTRAINT "bot_guilds_active_campaign_id_campaigns_id_fk" FOREIGN KEY ("active_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;