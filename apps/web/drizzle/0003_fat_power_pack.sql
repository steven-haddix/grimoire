CREATE TABLE "bot_guilds" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"installed" boolean DEFAULT true NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
