import { createHash } from "node:crypto";
import {
  EnableSourceRequest,
  IgnoreSeriesRequest,
  type EventResult,
  PairingPollRequest,
  PairingStartRequest,
  parseEventBatch,
} from "@rwt/core";
import type { Db } from "@rwt/db";
import { authenticateDevice, type DeviceSummary, pollPairing, startPairing } from "../devices";
import { RateLimiter } from "../http/rate-limit";
import { bearerToken, clientAddress, errorResponse, jsonResponse, type Parsed, readJsonBody } from "../http/request";
import { ignoreSeries } from "../ignore";
import { ingestEvents } from "../ingest";
import { buildDeviceConfig, enableSource, SourceConflictError, SourceNotFoundError } from "../sources";

const MINUTE = 60_000;
// 100 events of at most ~3 KB each, with headroom.
const MAX_EVENTS_BODY_BYTES = 512 * 1024;
const MAX_SMALL_BODY_BYTES = 4 * 1024;

export interface ApiLimiters {
  authFailures: RateLimiter;
  events: RateLimiter;
  config: RateLimiter;
  sources: RateLimiter;
  pairingStart: RateLimiter;
  pairingPoll: RateLimiter;
}

export function createApiLimiters(
  overrides: { eventsPerMinute?: number; pairingStartsPerMinute?: number; authFailuresPerMinute?: number } = {},
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
