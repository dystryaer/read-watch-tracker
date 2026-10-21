import { z } from "zod";
import { MAX_URL_LENGTH, parseHttpUrl } from "./safe-url";

export const MAX_TEXT_LENGTH = 300;
export const MAX_BATCH_SIZE = 100;
// Upper bound before cleanup, so oversized strings are refused before any regex runs on them.
const MAX_RAW_TEXT_LENGTH = 1000;

export const MediaType = z.enum([
  "manga",
  "manhwa",
  "manhua",
  "light_novel",
  "ebook",
  "anime",
  "series",
  "movie",
]);
export type MediaType = z.infer<typeof MediaType>;

export const EventKind = z.enum(["read", "watched", "library_sync", "backfill"]);
export type EventKind = z.infer<typeof EventKind>;

export const EventOutcome = z.enum(["applied", "no_change", "pending", "ignored", "rejected"]);
export type EventOutcome = z.infer<typeof EventOutcome>;

// Bidi controls reorder the rest of a line when displayed ("Dark" + RLO + "…"): titles from
// devices could otherwise spoof what the inbox shows next to them.
const BIDI_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/**
 * The cleanup of all text from devices and forms: bidi controls go, control characters (including
 * NUL, which Postgres text columns reject) become spaces, whitespace is collapsed and trimmed.
 */
export function cleanTextValue(value: string): string {
  return value.replace(BIDI_CONTROLS, "").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
}

/** Single-line text from devices or forms: cleaned (cleanTextValue), then non-empty and length-capped. */
export function cleanText(maxLength: number) {
  return z
    .string()
    .max(Math.max(MAX_RAW_TEXT_LENGTH, maxLength * 2))
    .transform(cleanTextValue)
    .pipe(z.string().min(1).max(maxLength));
}

const Text = cleanText(MAX_TEXT_LENGTH);

export const HttpUrlSchema = z
  .string()
  .max(MAX_URL_LENGTH)
  .regex(/^https?:\/\//i)
  .refine((value) => parseHttpUrl(value) !== null, "must be an http(s) URL without credentials");

export const SourceKey = z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,99}$/);

const hasAtMostTwoDecimals = (value: number) => Math.round(value * 100) / 100 === value;

/** A chapter number as positions store it; shared with every input that becomes a position. */
export const ChapterNumber = z.number().min(0).max(99999.99).refine(hasAtMostTwoDecimals, "at most two decimals");
export const PercentNumber = z.number().min(0).max(100).refine(hasAtMostTwoDecimals, "at most two decimals");

export const Position = z.discriminatedUnion("unit", [
  z.object({
    unit: z.literal("chapter"),
    chapter: ChapterNumber,
  }),
  z.object({
    unit: z.literal("episode"),
    season: z.number().int().min(1).max(999).nullable(),
    episode: z.number().int().min(1).max(99999),
  }),
  z.object({
    unit: z.literal("percent"),
    percent: PercentNumber,
  }),
  z.object({ unit: z.literal("none") }),
]);
export type Position = z.infer<typeof Position>;

export const ProgressEvent = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  kind: EventKind,
  source: z.object({
    key: SourceKey,
    externalKey: Text,
    rawTitle: Text,
    url: HttpUrlSchema.optional(),
    seriesUrl: HttpUrlSchema.optional(),
  }),
  position: Position,
  mediaTypeHint: MediaType.optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;

export type BatchItem =
  | { ok: true; index: number; event: ProgressEvent }
  | { ok: false; index: number; id: string | null; reason: string };

export type BatchParseResult =
  | { ok: true; items: BatchItem[] }
  | { ok: false; error: "invalid_batch" | "too_many_events" };

const BatchShape = z.object({ events: z.array(z.unknown()).min(1) });

/**
 * Validates the batch envelope, then each event on its own: one malformed event is
 * reported as rejected while the rest of the batch is still processed (SPEC §6.1).
 */
export function parseEventBatch(body: unknown): BatchParseResult {
  const shape = BatchShape.safeParse(body);
  if (!shape.success) return { ok: false, error: "invalid_batch" };
  if (shape.data.events.length > MAX_BATCH_SIZE) return { ok: false, error: "too_many_events" };
  return { ok: true, items: shape.data.events.map(parseBatchItem) };
}

function parseBatchItem(raw: unknown, index: number): BatchItem {
  const parsed = ProgressEvent.safeParse(raw);
  if (parsed.success) return { ok: true, index, event: parsed.data };
  return { ok: false, index, id: extractEventId(raw), reason: describeIssue(parsed.error) };
}

// Lets the client drop a rejected event from its outbox even though the event is invalid.
function extractEventId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || !("id" in raw)) return null;
  const id = z.uuid().safeParse(raw.id);
  return id.success ? id.data : null;
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "invalid event";
  const path = issue.path.length > 0 ? issue.path.join(".") : "event";
  return `${path}: ${issue.message}`.slice(0, 200);
}
