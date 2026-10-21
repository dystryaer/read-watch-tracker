ALTER TABLE "sources" ADD COLUMN "last_library_sync_at" timestamp with time zone;--> statement-breakpoint
-- Libraries synced before this column existed keep their last sync time.
UPDATE "sources" SET "last_library_sync_at" = (SELECT max("received_at") FROM "events" WHERE "events"."source_id" = "sources"."id" AND "events"."kind" = 'library_sync');
