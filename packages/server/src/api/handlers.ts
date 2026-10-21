import { createHash } from "node:crypto";
import {
  ApiError,
  EnableSourceRequest,
  IgnoreSeriesRequest,
  type EventResult,
  LatestChaptersRequest,
  type SeriesWatchResponse,
  PairingPollRequest,
  PairingStartRequest,
  parseEventBatch,
  ShareConfirmRequest,
  ShareRequest,
} from "@rwt/core";
import type { Db } from "@rwt/db";
import { authenticateDevice, type DeviceSummary, pollPairing, startPairing } from "../devices";
import { RateLimiter } from "../http/rate-limit";
import { bearerToken, clientAddress, errorResponse, jsonResponse, type Parsed, readJsonBody } from "../http/request";
import { ignoreSeries } from "../ignore";
import { ingestEvents } from "../ingest";
import { recordLatestChapters, seriesToWatch } from "../latest";
import { confirmShare, ShareNotFoundError, ShareUsedError, ShareValueError, startShare } from "../share";
import { buildDeviceConfig, enableSource, ServiceDomainError, SourceConflictError, SourceNotFoundError } from "../sources";

const MINUTE = 60_000;
// 100 events of at most ~3 KB each, with headroom.
const MAX_EVENTS_BODY_BYTES = 512 * 1024;
const MAX_SMALL_BODY_BYTES = 4 * 1024;
// A shared URL (≤ 2048) plus its text (≤ 2000), with headroom for multibyte characters.
const MAX_SHARE_BODY_BYTES = 16 * 1024;
// 100 items with keys of at most ~1 KB each before cleanup.
const MAX_LATEST_BODY_BYTES = 128 * 1024;

export interface ApiLimiters {
  authFailures: RateLimiter;
  events: RateLimiter;
  config: RateLimiter;
  sources: RateLimiter;
  pairingStart: RateLimiter;
  pairingPoll: RateLimiter;
  shares: RateLimiter;
  newChapters: RateLimiter;
}

export function createApiLimiters(
  overrides: {
    eventsPerMinute?: number;
    pairingStartsPerMinute?: number;
    authFailuresPerMinute?: number;
    sharesPerMinute?: number;
    newChaptersPerMinute?: number;
  } = {},
): ApiLimiters {
  return {
    // Wrong tokens per client address: guessing is hopeless (256 bit), but each try costs a query.
    authFailures: new RateLimiter({ limit: overrides.authFailuresPerMinute ?? 30, windowMs: MINUTE }),
    events: new RateLimiter({ limit: overrides.eventsPerMinute ?? 60, windowMs: MINUTE }),
    config: new RateLimiter({ limit: 30, windowMs: MINUTE }),
    sources: new RateLimiter({ limit: 30, windowMs: MINUTE }),
    pairingStart: new RateLimiter({ limit: overrides.pairingStartsPerMinute ?? 10, windowMs: MINUTE }),
    // Devices poll every 3 s while a code is shown.
    pairingPoll: new RateLimiter({ limit: 40, windowMs: MINUTE }),
    shares: new RateLimiter({ limit: overrides.sharesPerMinute ?? 30, windowMs: MINUTE }),
    // The extension asks for the watch list at most every 6 hours and reports once an hour.
    newChapters: new RateLimiter({ limit: overrides.newChaptersPerMinute ?? 10, windowMs: MINUTE }),
  };
}

export interface ApiContext {
  db: Db;
  limiters: ApiLimiters;
  now?: () => Date;
}

const tooManyRequests = () => errorResponse("rate_limited", 429, { "retry-after": "60" });

async function authenticate(request: Request, context: ApiContext): Promise<Parsed<DeviceSummary>> {
  const token = bearerToken(request);
  const device = token ? await authenticateDevice(context.db, token, context.now?.()) : null;
  if (device) return { ok: true, value: device };
  if (!context.limiters.authFailures.allow(clientAddress(request.headers))) return { ok: false, response: tooManyRequests() };
  return { ok: false, response: errorResponse("unauthorized", 401, { "www-authenticate": "Bearer" }) };
}

/** POST /api/v1/events (SPEC §6.1). */
export async function handleEvents(request: Request, context: ApiContext): Promise<Response> {
  const device = await authenticate(request, context);
  if (!device.ok) return device.response;
  // Phone tokens live in a shortcut on the phone; they only reach the share endpoints.
  if (device.value.kind === "phone") return errorResponse("forbidden", 403);
  if (!context.limiters.events.allow(device.value.id)) return tooManyRequests();

  const body = await readJsonBody(request, MAX_EVENTS_BODY_BYTES);
  if (!body.ok) return body.response;
  const batch = parseEventBatch(body.value);
  if (!batch.ok) return errorResponse(batch.error, batch.error === "too_many_events" ? 413 : 400);

  const valid = batch.items.flatMap((item) => (item.ok ? [item.event] : []));
  const ingested = await ingestEvents(context.db, device.value.id, valid, context.now?.());

  let next = 0;
  const results: EventResult[] = batch.items.map((item) => {
    if (!item.ok) return { id: item.id, index: item.index, outcome: "rejected", reason: item.reason };
    const result = ingested[next++];
    if (!result) throw new Error("Ingest returned fewer results than events");
    return { id: result.id, index: item.index, outcome: result.outcome };
  });
  return jsonResponse({ results });
}

/** GET /api/v1/config with ETag, so devices can poll cheaply. */
export async function handleConfig(request: Request, context: ApiContext): Promise<Response> {
  const device = await authenticate(request, context);
  if (!device.ok) return device.response;
  if (device.value.kind === "phone") return errorResponse("forbidden", 403);
  if (!context.limiters.config.allow(device.value.id)) return tooManyRequests();

  const body = JSON.stringify(await buildDeviceConfig(context.db));
  const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
  const cacheHeaders = { etag, "cache-control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cacheHeaders });
  return new Response(body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", ...cacheHeaders } });
}

/** POST /api/v1/pairing – unauthenticated, so it is rate-limited per client address. */
export async function handlePairingStart(request: Request, context: ApiContext): Promise<Response> {
  if (!context.limiters.pairingStart.allow(clientAddress(request.headers))) return tooManyRequests();
  const body = await readJsonBody(request, MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;
  const input = PairingStartRequest.safeParse(body.value);
  if (!input.success) return errorResponse("invalid_request", 400);

  const pairing = await startPairing(context.db, input.data, context.now?.());
  return jsonResponse({ ...pairing, expiresAt: pairing.expiresAt.toISOString() }, 201);
}

/** POST /api/v1/pairing/poll – the token is handed out exactly once. */
export async function handlePairingPoll(request: Request, context: ApiContext): Promise<Response> {
  if (!context.limiters.pairingPoll.allow(clientAddress(request.headers))) return tooManyRequests();
  const body = await readJsonBody(request, MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;
  const input = PairingPollRequest.safeParse(body.value);
  if (!input.success) return errorResponse("invalid_request", 400);

  return jsonResponse(await pollPairing(context.db, input.data.pollSecret, context.now?.()));
}

/** POST /api/v1/sources/enable – "Diese Seite tracken" from the extension popup. */
export async function handleEnableSource(request: Request, context: ApiContext): Promise<Response> {
  const device = await authenticate(request, context);
  if (!device.ok) return device.response;
  if (device.value.kind !== "extension") return errorResponse("forbidden", 403);
  if (!context.limiters.sources.allow(device.value.id)) return tooManyRequests();

  const body = await readJsonBody(request, MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;
  const input = EnableSourceRequest.safeParse(body.value);
  if (!input.success) return errorResponse("invalid_request", 400);

  try {
    return jsonResponse(await enableSource(context.db, input.data));
  } catch (error) {
    if (error instanceof SourceNotFoundError) return errorResponse("source_not_found", 404);
    if (error instanceof SourceConflictError) return errorResponse("domain_taken", 409);
    if (error instanceof ServiceDomainError) return errorResponse("service_domain", 409);
    throw error;
  }
}

/** POST /api/v1/ignore – "Falsch erkannt? Serie ignorieren" from the extension popup. */
export async function handleIgnoreSeries(request: Request, context: ApiContext): Promise<Response> {
  const device = await authenticate(request, context);
  if (!device.ok) return device.response;
  if (device.value.kind !== "extension") return errorResponse("forbidden", 403);
  if (!context.limiters.sources.allow(device.value.id)) return tooManyRequests();

  const body = await readJsonBody(request, MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;
  const input = IgnoreSeriesRequest.safeParse(body.value);
  if (!input.success) return errorResponse("invalid_request", 400);

  try {
    await ignoreSeries(context.db, input.data, context.now?.());
  } catch (error) {
    if (error instanceof SourceNotFoundError) return errorResponse("source_not_found", 404);
    throw error;
  }
  return jsonResponse({ ok: true });
}

/** GET /api/v1/series-watch – M4: the series pages the extension may check for new chapters (SPEC §7.11). */
export async function handleSeriesWatch(request: Request, context: ApiContext): Promise<Response> {
  const device = await authenticate(request, context);
  if (!device.ok) return device.response;
  if (device.value.kind !== "extension") return errorResponse("forbidden", 403);
  if (!context.limiters.newChapters.allow(device.value.id)) return tooManyRequests();
  return jsonResponse({ series: await seriesToWatch(context.db) } satisfies SeriesWatchResponse);
}

/** POST /api/v1/latest-chapters – M4: the newest chapters the extension found on series pages. */
export async function handleLatestChapters(request: Request, context: ApiContext): Promise<Response> {
  const device = await authenticate(request, context);
  if (!device.ok) return device.response;
  if (device.value.kind !== "extension") return errorResponse("forbidden", 403);
  if (!context.limiters.newChapters.allow(device.value.id)) return tooManyRequests();

  const body = await readJsonBody(request, MAX_LATEST_BODY_BYTES);
  if (!body.ok) return body.response;
  const input = LatestChaptersRequest.safeParse(body.value);
  if (!input.success) return errorResponse("invalid_request", 400);
  return jsonResponse({ updated: await recordLatestChapters(context.db, input.data.items, context.now?.()) });
}

// The iOS shortcut shows `message` to the user as it is (SPEC §9.6: understandable errors).
const shareError = (error: string, status: number, message: string) => jsonResponse({ error, message }, status);

const INVALID_SHORTCUT = "Der Kurzbefehl hat etwas Unerwartetes geschickt. Bitte den Kurzbefehl aus den Tracker-Einstellungen neu einrichten.";
const SHARE_MESSAGES: Record<string, string> = {
  unauthorized: "Dieser Kurzbefehl ist nicht mehr mit dem Tracker verbunden. Bitte in den Tracker-Einstellungen einen neuen iPhone-Kurzbefehl hinzufügen.",
  forbidden: "Dieser Schlüssel gehört zu keinem iPhone-Kurzbefehl. Bitte in den Tracker-Einstellungen einen iPhone-Kurzbefehl hinzufügen.",
  rate_limited: "Zu viele Anfragen – bitte eine Minute warten.",
  payload_too_large: "Der geteilte Text ist zu lang.",
  unsupported_media_type: INVALID_SHORTCUT,
  invalid_json: INVALID_SHORTCUT,
  invalid_request: INVALID_SHORTCUT,
};

/** Adds the shortcut's message to the generic errors of the shared helpers; keeps status and headers. */
async function explained(response: Response): Promise<Response> {
  if (response.ok) return response;
  const body = ApiError.safeParse(await response.clone().json().catch(() => null));
  const message = body.success && body.data.message === undefined ? SHARE_MESSAGES[body.data.error] : undefined;
  if (!body.success || message === undefined) return response;
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return jsonResponse({ error: body.data.error, message }, response.status, headers);
}

async function authenticatePhone(request: Request, context: ApiContext): Promise<Parsed<DeviceSummary>> {
  const device = await authenticate(request, context);
  if (device.ok && device.value.kind !== "phone") return { ok: false, response: errorResponse("forbidden", 403) };
  return device;
}

/** POST /api/v1/share: which book was shared, where it stands and what to suggest (SPEC §9.4). */
export async function handleShare(request: Request, context: ApiContext): Promise<Response> {
  return explained(await share(request, context));
}

async function share(request: Request, context: ApiContext): Promise<Response> {
  const device = await authenticatePhone(request, context);
  if (!device.ok) return device.response;
  if (!context.limiters.shares.allow(device.value.id)) return tooManyRequests();

  const body = await readJsonBody(request, MAX_SHARE_BODY_BYTES);
  if (!body.ok) return body.response;
  const input = ShareRequest.safeParse(body.value);
  if (!input.success) return errorResponse("invalid_request", 400);

  const started = await startShare(context.db, device.value.id, input.data, context.now?.());
  if (!started) return shareError("unknown_link", 422, "Dieser Link gehört zu keinem Buch aus WebNovel oder Kindle.");
  return jsonResponse(started);
}

/** POST /api/v1/share/confirm: the confirmed chapter or percentage becomes an event. */
export async function handleShareConfirm(request: Request, context: ApiContext): Promise<Response> {
  return explained(await shareConfirm(request, context));
}

async function shareConfirm(request: Request, context: ApiContext): Promise<Response> {
  const device = await authenticatePhone(request, context);
  if (!device.ok) return device.response;
  if (!context.limiters.shares.allow(device.value.id)) return tooManyRequests();

  const body = await readJsonBody(request, MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;
  const input = ShareConfirmRequest.safeParse(body.value);
  if (!input.success) return shareError("invalid_request", 400, "Bitte eine Zahl eingeben.");

  try {
    return jsonResponse(await confirmShare(context.db, device.value.id, input.data, context.now?.()));
  } catch (error) {
    if (error instanceof ShareNotFoundError) return shareError("share_not_found", 404, "Das ist abgelaufen. Bitte das Buch noch einmal teilen.");
    if (error instanceof ShareUsedError) return shareError("share_used", 409, "Schon gespeichert. Für eine andere Zahl das Buch noch einmal teilen.");
    if (error instanceof ShareValueError) return shareError("invalid_value", 400, "Diese Zahl passt nicht zu dem Buch.");
    throw error;
  }
}
