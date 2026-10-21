CREATE TYPE "public"."device_kind" AS ENUM('extension', 'shield', 'phone');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('read', 'watched', 'library_sync', 'backfill', 'manual');--> statement-breakpoint
CREATE TYPE "public"."event_outcome" AS ENUM('applied', 'no_change', 'pending', 'ignored', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('manga', 'manhwa', 'manhua', 'light_novel', 'ebook', 'anime', 'series', 'movie');--> statement-breakpoint
CREATE TYPE "public"."pending_resolution" AS ENUM('linked', 'new_work', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('website', 'streaming', 'app');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('reading', 'completed', 'dropped');--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "device_kind" NOT NULL,
	"token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid,
	"source_id" uuid,
	"kind" "event_kind" NOT NULL,
	"external_key" text,
	"raw_title" text,
	"url" text,
	"chapter" numeric(7, 2),
	"season" integer,
	"episode" integer,
	"percent" numeric(5, 2),
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"work_id" uuid,
	"outcome" "event_outcome" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"poll_secret_hash" text NOT NULL,
	"device_kind" "device_kind" NOT NULL,
	"device_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_device_id" uuid,
	"token_issued_at" timestamp with time zone,
	CONSTRAINT "pairing_codes_poll_secret_hash_unique" UNIQUE("poll_secret_hash")
);
--> statement-breakpoint
CREATE TABLE "pending_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_key" text NOT NULL,
	"raw_title" text NOT NULL,
	"media_type_hint" "media_type",
	"series_url" text,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" "pending_resolution"
);
--> statement-breakpoint
CREATE TABLE "source_domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"tracking_enabled" boolean DEFAULT false NOT NULL,
	"default_media_type" "media_type",
	"rule_chapter_pattern" text,
	"rule_series_pattern" text,
	"rule_title_selector" text,
	"rule_end_selector" text,
	"rule_next_url_template" text,
	"rule_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "work_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_key" text NOT NULL,
	"external_title" text NOT NULL,
	"external_title_normalized" text NOT NULL,
	"series_url" text,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"title_normalized" text NOT NULL,
	"status" "work_status" DEFAULT 'reading' NOT NULL,
	"chapter" numeric(7, 2),
	"season" integer,
	"episode" integer,
	"percent" numeric(5, 2),
	"last_source_id" uuid,
	"last_url" text,
	"last_progress_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_position_matches_type" CHECK ((
        ("works"."type" IN ('manga', 'manhwa', 'manhua', 'light_novel')
          AND "works"."season" IS NULL AND "works"."episode" IS NULL AND "works"."percent" IS NULL)
        OR ("works"."type" IN ('anime', 'series')
          AND "works"."chapter" IS NULL AND "works"."percent" IS NULL
          AND ("works"."season" IS NULL OR "works"."episode" IS NOT NULL))
        OR ("works"."type" = 'ebook'
          AND "works"."chapter" IS NULL AND "works"."season" IS NULL AND "works"."episode" IS NULL)
        OR ("works"."type" = 'movie'
          AND "works"."chapter" IS NULL AND "works"."season" IS NULL
          AND "works"."episode" IS NULL AND "works"."percent" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_approved_device_id_devices_id_fk" FOREIGN KEY ("approved_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_matches" ADD CONSTRAINT "pending_matches_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_domains" ADD CONSTRAINT "source_domains_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_links" ADD CONSTRAINT "work_links_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_links" ADD CONSTRAINT "work_links_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_last_source_id_sources_id_fk" FOREIGN KEY ("last_source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_work_time" ON "events" USING btree ("work_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_pending_key" ON "events" USING btree ("source_id","external_key") WHERE "events"."outcome" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "pending_matches_open_key" ON "pending_matches" USING btree ("source_id","external_key") WHERE "pending_matches"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "pending_matches_key" ON "pending_matches" USING btree ("source_id","external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "source_domains_one_current" ON "source_domains" USING btree ("source_id") WHERE "source_domains"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "work_links_source_key" ON "work_links" USING btree ("source_id","external_key");--> statement-breakpoint
CREATE INDEX "work_links_source_title" ON "work_links" USING btree ("source_id","external_title_normalized");--> statement-breakpoint
CREATE INDEX "work_links_title_trgm" ON "work_links" USING gin ("external_title_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "work_links_work" ON "work_links" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "works_title_trgm" ON "works" USING gin ("title_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "works_last_progress" ON "works" USING btree ("last_progress_at");