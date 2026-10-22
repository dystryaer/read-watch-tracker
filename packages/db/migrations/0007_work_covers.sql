CREATE TYPE "public"."cover_kind" AS ENUM('site', 'upload', 'removed', 'unusable');--> statement-breakpoint
CREATE TABLE "work_covers" (
	"work_id" uuid PRIMARY KEY NOT NULL,
	"kind" "cover_kind" NOT NULL,
	"mime" text,
	"image" "bytea",
	"source_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_covers_image_matches_kind" CHECK (("work_covers"."kind" IN ('site', 'upload')) = ("work_covers"."image" IS NOT NULL AND "work_covers"."mime" IS NOT NULL)),
	CONSTRAINT "work_covers_mime" CHECK (mime IS NULL OR mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'))
);
--> statement-breakpoint
ALTER TABLE "pending_matches" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "work_links" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "work_covers" ADD CONSTRAINT "work_covers_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_covers_source_url" ON "work_covers" USING btree ("source_url");