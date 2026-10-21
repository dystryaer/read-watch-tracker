import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => timestamptz("created_at").notNull().defaultNow();

export const mediaType = pgEnum("media_type", [
  "manga",
  "manhwa",
  "manhua",
  "light_novel",
  "ebook",
  "anime",
  "series",
  "movie",
]);
export const workStatus = pgEnum("work_status", ["reading", "completed", "dropped"]);
export const sourceKind = pgEnum("source_kind", ["website", "streaming", "app"]);
export const deviceKind = pgEnum("device_kind", ["extension", "shield", "phone"]);
export const eventKind = pgEnum("event_kind", ["read", "watched", "library_sync", "backfill", "manual"]);
export const eventOutcome = pgEnum("event_outcome", ["applied", "no_change", "pending", "ignored", "rejected"]);
export const pendingResolution = pgEnum("pending_resolution", ["linked", "new_work", "ignored"]);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  kind: sourceKind("kind").notNull(),
  trackingEnabled: boolean("tracking_enabled").notNull().default(false),
  defaultMediaType: mediaType("default_media_type"),
  ruleChapterPattern: text("rule_chapter_pattern"),
  ruleSeriesPattern: text("rule_series_pattern"),
  ruleTitleSelector: text("rule_title_selector"),
  ruleEndSelector: text("rule_end_selector"),
  ruleNextUrlTemplate: text("rule_next_url_template"),
  ruleUpdatedAt: timestamptz("rule_updated_at"),
  createdAt: createdAt(),
});

export const sourceDomains = pgTable(
  "source_domains",
  {
    domain: text("domain").primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    isCurrent: boolean("is_current").notNull().default(false),
    addedAt: timestamptz("added_at").notNull().defaultNow(),
  },
  (table) => [
    // Exactly one current domain per source is enforced by the database, not only the app.
    uniqueIndex("source_domains_one_current").on(table.sourceId).where(sql`${table.isCurrent}`),
  ],
);

export const works = pgTable(
  "works",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: mediaType("type").notNull(),
    title: text("title").notNull(),
    titleNormalized: text("title_normalized").notNull(),
    status: workStatus("status").notNull().default("reading"),
    chapter: numeric("chapter", { precision: 7, scale: 2, mode: "number" }),
    season: integer("season"),
    episode: integer("episode"),
    percent: numeric("percent", { precision: 5, scale: 2, mode: "number" }),
    lastSourceId: uuid("last_source_id").references(() => sources.id, { onDelete: "set null" }),
    lastUrl: text("last_url"),
    lastProgressAt: timestamptz("last_progress_at"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("works_title_trgm").using("gin", table.titleNormalized.op("gin_trgm_ops")),
    index("works_last_progress").on(table.lastProgressAt),
    // Only the position columns that fit the media type may be set (SPEC §5.1).
    check(
      "works_position_matches_type",
      sql`(
        (${table.type} IN ('manga', 'manhwa', 'manhua', 'light_novel')
          AND ${table.season} IS NULL AND ${table.episode} IS NULL AND ${table.percent} IS NULL)
        OR (${table.type} IN ('anime', 'series')
          AND ${table.chapter} IS NULL AND ${table.percent} IS NULL
          AND (${table.season} IS NULL OR ${table.episode} IS NOT NULL))
        OR (${table.type} = 'ebook'
          AND ${table.chapter} IS NULL AND ${table.season} IS NULL AND ${table.episode} IS NULL)
        OR (${table.type} = 'movie'
          AND ${table.chapter} IS NULL AND ${table.season} IS NULL
          AND ${table.episode} IS NULL AND ${table.percent} IS NULL)
      )`,
    ),
  ],
);

export const workLinks = pgTable(
  "work_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalKey: text("external_key").notNull(),
    externalTitle: text("external_title").notNull(),
    externalTitleNormalized: text("external_title_normalized").notNull(),
    seriesUrl: text("series_url"),
    confirmedAt: timestamptz("confirmed_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("work_links_source_key").on(table.sourceId, table.externalKey),
    index("work_links_source_title").on(table.sourceId, table.externalTitleNormalized),
    index("work_links_title_trgm").using("gin", table.externalTitleNormalized.op("gin_trgm_ops")),
    index("work_links_work").on(table.workId),
  ],
);

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: deviceKind("kind").notNull(),
  // SHA-256 of the token; null until the token is issued. The token itself is never stored.
  tokenHash: text("token_hash").unique(),
  createdAt: createdAt(),
  lastSeenAt: timestamptz("last_seen_at"),
  revokedAt: timestamptz("revoked_at"),
});

export const pairingCodes = pgTable("pairing_codes", {
  code: text("code").primaryKey(),
  pollSecretHash: text("poll_secret_hash").notNull().unique(),
  deviceKind: deviceKind("device_kind").notNull(),
  deviceName: text("device_name").notNull(),
  createdAt: createdAt(),
  expiresAt: timestamptz("expires_at").notNull(),
  approvedDeviceId: uuid("approved_device_id").references(() => devices.id, { onDelete: "cascade" }),
  tokenIssuedAt: timestamptz("token_issued_at"),
});

export const events = pgTable(
  "events",
  {
    // Client-generated, which makes resending an event harmless (idempotency).
    id: uuid("id").primaryKey(),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    kind: eventKind("kind").notNull(),
    externalKey: text("external_key"),
    rawTitle: text("raw_title"),
    url: text("url"),
    chapter: numeric("chapter", { precision: 7, scale: 2, mode: "number" }),
    season: integer("season"),
    episode: integer("episode"),
    percent: numeric("percent", { precision: 5, scale: 2, mode: "number" }),
    occurredAt: timestamptz("occurred_at").notNull(),
    receivedAt: timestamptz("received_at").notNull().defaultNow(),
    workId: uuid("work_id").references(() => works.id, { onDelete: "set null" }),
    outcome: eventOutcome("outcome").notNull(),
    // This event re-recognized its series under a new key (SPEC §5.3 step 4); shown in the history.
    relinked: boolean("relinked").notNull().default(false),
  },
  (table) => [
    index("events_work_time").on(table.workId, table.occurredAt),
    index("events_pending_key")
      .on(table.sourceId, table.externalKey)
      .where(sql`${table.outcome} = 'pending'`),
  ],
);

export interface MatchCandidate {
  workId: string;
  score: number;
}

export const pendingMatches = pgTable(
  "pending_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalKey: text("external_key").notNull(),
    rawTitle: text("raw_title").notNull(),
    mediaTypeHint: mediaType("media_type_hint"),
    seriesUrl: text("series_url"),
    candidates: jsonb("candidates").$type<MatchCandidate[]>().notNull().default([]),
    eventCount: integer("event_count").notNull().default(0),
    firstSeenAt: timestamptz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
    resolvedAt: timestamptz("resolved_at"),
    resolution: pendingResolution("resolution"),
  },
  (table) => [
    uniqueIndex("pending_matches_open_key")
      .on(table.sourceId, table.externalKey)
      .where(sql`${table.resolvedAt} IS NULL`),
    index("pending_matches_key").on(table.sourceId, table.externalKey),
  ],
);
export * from "./auth-schema";
