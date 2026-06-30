CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "searchable_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer,
	"source_type" text NOT NULL,
	"source_id" integer,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"speaker" text,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "searchable_chunks" ADD CONSTRAINT "searchable_chunks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searchable_chunks" ADD CONSTRAINT "searchable_chunks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "searchable_chunks_campaign_idx" ON "searchable_chunks" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "searchable_chunks_session_idx" ON "searchable_chunks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "searchable_chunks_source_idx" ON "searchable_chunks" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "searchable_chunks_embedding_idx" ON "searchable_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "searchable_chunks_search_vector_idx" ON "searchable_chunks" USING gin ("search_vector");