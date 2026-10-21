ALTER TABLE "works" ADD COLUMN "latest_chapter" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "latest_chapter_at" timestamp with time zone;