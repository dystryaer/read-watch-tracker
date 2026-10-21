import { z } from "zod";
import { ChapterNumber, cleanText, EventOutcome, HttpUrlSchema, MAX_TEXT_LENGTH, PercentNumber, SourceKey } from "./event";
import { MAX_URL_LENGTH, parseHttpUrl } from "./safe-url";
import { SiteRule } from "./site-rule";

/**
 * Request and response shapes of the device API (SPEC §6). Shared by the server, which validates
 * requests, and by the clients, which validate responses: neither side trusts the other's JSON.
 */

export const DeviceName = cleanText(100);

export const PairingStartRequest = z.object({
  // Phones get their token in the web app instead (SPEC §6.2).
  kind: z.enum(["extension", "shield"]),
  name: DeviceName,
});

export const PairingStartResponse = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  pollSecret: z.string().min(20).max(100),
  expiresAt: z.iso.datetime({ offset: true }),
});

export const PairingPollRequest = z.object({ pollSecret: z.string().min(1).max(100) });

export const PairingPollResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("expired") }),
  z.object({ status: z.literal("approved"), deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
]);
export type PairingPollResponse = z.infer<typeof PairingPollResponse>;

export const EventResult = z.object({
  id: z.uuid().nullable(),
  index: z.number().int().min(0),
  outcome: EventOutcome,
  reason: z.string().max(200).optional(),
});
export const EventResultsResponse = z.object({ results: z.array(EventResult) });
export type EventResult = z.infer<typeof EventResult>;

export const Thresholds = z.object({
  scrollDepthPercent: z.number().int().min(10).max(100),
  watchedPercent: z.number().int().min(50).max(100),
});
export type Thresholds = z.infer<typeof Thresholds>;
export const DEFAULT_THRESHOLDS: Thresholds = { scrollDepthPercent: 60, watchedPercent: 85 };

export const DeviceConfig = z.object({
  sites: z.array(SiteRule).max(500),
  thresholds: Thresholds,
});
export type DeviceConfig = z.infer<typeof DeviceConfig>;

export const SiteOrigin = HttpUrlSchema.refine((value) => {
  const url = parseHttpUrl(value);
  return url !== null && url.href === `${url.origin}/`;
}, "must be an origin such as https://example.org");

export const EnableSourceRequest = z.object({
  origin: z.string().transform((value) => value.replace(/\/?$/, "/")).pipe(SiteOrigin),
  name: cleanText(100).optional(),
  moveFromSourceKey: SourceKey.optional(),
});

export const EnableSourceResponse = z.object({
  sourceKey: SourceKey,
  name: z.string().max(100),
  domains: z.array(z.string().max(253)).max(50),
});
export type EnableSourceResponse = z.infer<typeof EnableSourceResponse>;

export const IgnoreSeriesRequest = z.object({
  sourceKey: SourceKey,
  externalKey: cleanText(MAX_TEXT_LENGTH),
  rawTitle: cleanText(MAX_TEXT_LENGTH),
});

/** What the iOS shortcut gets from the share sheet (SPEC §9.4); the server finds the book in it. */
export const ShareRequest = z
  .object({
    url: z.string().max(MAX_URL_LENGTH).optional(),
    text: z.string().max(2000).optional(),
  })
  .refine((share) => Boolean(share.url || share.text), "url or text is required");

export const ShareResponse = z.object({
  shareId: z.uuid(),
  /** The work's title, or the shared book's title while it is not assigned yet. */
  title: z.string().max(MAX_TEXT_LENGTH),
  unit: z.enum(["chapter", "percent"]),
  current: z.number().nullable(),
  /** Pre-filled in the shortcut: chapter n+1, or the last percentage. */
  suggested: z.number().nullable(),
  needsMatch: z.boolean(),
});
export type ShareResponse = z.infer<typeof ShareResponse>;

// Shortcuts may send a number as text, and a German keyboard types a decimal comma.
// Only plain decimals: Number() would also take "", "0x10" or "1e3".
const TYPED_DECIMAL = /^\d+(?:[.,]\d+)?$/;
const typedNumber = (schema: z.ZodType<number>) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const typed = value.trim();
    return TYPED_DECIMAL.test(typed) ? Number(typed.replace(",", ".")) : Number.NaN;
  }, schema);

// The same number rules as the positions they become, so a confirmed value always fits an event.
export const ShareConfirmRequest = z
  .object({
    shareId: z.uuid(),
    chapter: typedNumber(ChapterNumber).optional(),
    percent: typedNumber(PercentNumber).optional(),
  })
  .refine((confirm) => (confirm.chapter === undefined) !== (confirm.percent === undefined), "exactly one of chapter and percent");
export type ShareConfirmRequest = z.infer<typeof ShareConfirmRequest>;

export const ShareConfirmResponse = z.object({
  outcome: EventOutcome,
  title: z.string().max(MAX_TEXT_LENGTH),
  /** Ready for the shortcut's notification, e.g. "Shadow Slave → Kap. 1205 gespeichert". */
  message: z.string().max(400),
});
export type ShareConfirmResponse = z.infer<typeof ShareConfirmResponse>;

export const ApiError = z.object({ error: z.string().max(100), message: z.string().max(400).optional() });
