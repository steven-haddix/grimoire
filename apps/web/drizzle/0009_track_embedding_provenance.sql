ALTER TABLE "searchable_chunks" ADD COLUMN "embedding_provider" text;--> statement-breakpoint
ALTER TABLE "searchable_chunks" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "searchable_chunks" ADD COLUMN "embedding_dimensions" integer;