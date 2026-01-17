CREATE TABLE "guild_installations" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"installed" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
