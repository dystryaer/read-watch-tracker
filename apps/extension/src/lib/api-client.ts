import {
  DeviceConfig,
  EnableSourceResponse,
  type EventResult,
  EventResultsResponse,
  type LatestChaptersRequest,
  LatestChaptersResponse,
  PairingPollResponse,
  PairingStartResponse,
  type ProgressEvent,
  SeriesWatchResponse,
} from "@rwt/core";
import { z } from "zod";

export type PostEventsResult =
  | { ok: true; results: EventResult[] }
  | { ok: false; kind: "unauthorized" | "retry"; message: string; retryAfterMs?: number };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; kind: "unauthorized" | "rejected" | "retry"; message: string; status?: number };

export type ConfigResult = { ok: true; notModified: true } | { ok: true; notModified: false; config: DeviceConfig; etag: string | null } | Extract<ApiResult<never>, { ok: false }>;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// No cookies, no caching, and no redirects: a redirect would carry the Authorization header to
// whatever host the server (or someone in between) names.
const REQUEST_DEFAULTS = { credentials: "omit", cache: "no-store", redirect: "error" } as const satisfies RequestInit;

function retryAfterMs(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) * 1000 : undefined;
}

/**
 * Client for the tracker's device API (SPEC §6). Every response is validated against the shared
 * contract: a broken or hostile server can cause a retry, but never a malformed state.
 */
export function createApiClient(fetchFn: Fetch) {
  async function call<T>(
    url: string,
    init: RequestInit,
    schema: z.ZodType<T>,
  ): Promise<ApiResult<T>> {
    let response: Response;
    try {
      response = await fetchFn(url, { ...init, ...REQUEST_DEFAULTS });
    } catch (error) {
      return { ok: false, kind: "retry", message: error instanceof Error ? error.message : "Netzwerkfehler" };
    }
    if (response.status === 401) return { ok: false, kind: "unauthorized", message: "Token nicht mehr gültig", status: 401 };
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      return { ok: false, kind: "rejected", message: `Server lehnt ab (${response.status})`, status: response.status };
    }
    if (!response.ok) return { ok: false, kind: "retry", message: `Server-Fehler (${response.status})`, status: response.status };

    try {
      const parsed = schema.safeParse(await response.json());
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, kind: "retry", message: "Unerwartete Antwort" };
    } catch {
      return { ok: false, kind: "retry", message: "Unerwartete Antwort" };
    }
  }

  const json = (body: unknown, token?: string): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

  return {
    async postEvents(apiUrl: string, token: string, events: ProgressEvent[]): Promise<PostEventsResult> {
      let response: Response;
      try {
        response = await fetchFn(`${apiUrl}/api/v1/events`, { ...json({ events }, token), ...REQUEST_DEFAULTS });
      } catch (error) {
        return { ok: false, kind: "retry", message: error instanceof Error ? error.message : "Netzwerkfehler" };
      }
      if (response.status === 401) return { ok: false, kind: "unauthorized", message: "Token nicht mehr gültig" };
      if (!response.ok) {
        return { ok: false, kind: "retry", message: `Server-Fehler (${response.status})`, retryAfterMs: retryAfterMs(response) };
      }
      try {
        const parsed = EventResultsResponse.safeParse(await response.json());
        if (parsed.success) return { ok: true, results: parsed.data.results };
      } catch {
        // fall through: keep the events and try again later
      }
      return { ok: false, kind: "retry", message: "Unerwartete Antwort vom Server" };
    },

    async getConfig(apiUrl: string, token: string, etag: string | null): Promise<ConfigResult> {
      let response: Response;
      try {
        response = await fetchFn(`${apiUrl}/api/v1/config`, {
          headers: { authorization: `Bearer ${token}`, ...(etag ? { "if-none-match": etag } : {}) },
          ...REQUEST_DEFAULTS,
        });
      } catch (error) {
        return { ok: false, kind: "retry", message: error instanceof Error ? error.message : "Netzwerkfehler" };
      }
      if (response.status === 304) return { ok: true, notModified: true };
      if (response.status === 401) return { ok: false, kind: "unauthorized", message: "Token nicht mehr gültig" };
      if (!response.ok) return { ok: false, kind: "retry", message: `Server-Fehler (${response.status})` };
      try {
        const parsed = DeviceConfig.safeParse(await response.json());
        if (parsed.success) return { ok: true, notModified: false, config: parsed.data, etag: response.headers.get("etag") };
      } catch {
        // fall through
      }
      return { ok: false, kind: "retry", message: "Unerwartete Konfiguration vom Server" };
    },

    startPairing: (apiUrl: string, name: string) =>
      call(`${apiUrl}/api/v1/pairing`, json({ kind: "extension", name }), PairingStartResponse),

    pollPairing: (apiUrl: string, pollSecret: string) =>
      call(`${apiUrl}/api/v1/pairing/poll`, json({ pollSecret }), PairingPollResponse),

    enableSource: (apiUrl: string, token: string, body: { origin: string; name?: string; moveFromSourceKey?: string }) =>
      call(`${apiUrl}/api/v1/sources/enable`, json(body, token), EnableSourceResponse),

    ignoreSeries: (apiUrl: string, token: string, body: { sourceKey: string; externalKey: string; rawTitle: string }) =>
      call(`${apiUrl}/api/v1/ignore`, json(body, token), z.object({ ok: z.literal(true) })),

    getSeriesWatch: (apiUrl: string, token: string) =>
      call(`${apiUrl}/api/v1/series-watch`, { headers: { authorization: `Bearer ${token}` } }, SeriesWatchResponse),

    postLatestChapters: (apiUrl: string, token: string, items: LatestChaptersRequest["items"]) =>
      call(`${apiUrl}/api/v1/latest-chapters`, json({ items }, token), LatestChaptersResponse),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
