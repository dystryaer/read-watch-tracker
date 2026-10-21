import { z } from "zod";
import { cleanText, EventOutcome, HttpUrlSchema, MAX_TEXT_LENGTH, SourceKey } from "./event";
import { parseHttpUrl } from "./safe-url";
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

export const ApiError = z.object({ error: z.string().max(100) });
