ALTER TABLE "sessions" ADD COLUMN "last_indexed_at" timestamp;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_indexed_transcript_id" integer;