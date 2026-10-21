import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src/lib/api-client";
import { event } from "./fakes";

const API = "https://tracker.example";
const TOKEN = "A".repeat(43);

function respond(body: unknown, init: ResponseInit = {}) {
  return vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), init));
}

describe("postEvents", () => {
  it("returns validated results and sends the token without cookies", async () => {
    const e = event();
    const fetchFn = respond({ results: [{ id: e.id, index: 0, outcome: "applied" }] });

    const result = await createApiClient(fetchFn).postEvents(API, TOKEN, [e]);

    expect(result).toEqual({ ok: true, results: [{ id: e.id, index: 0, outcome: "applied" }] });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/api/v1/events`);
    expect(init.credentials).toBe("omit");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it.each([
    [{ results: [{ id: "x", index: 0, outcome: "applied" }] }],
    [{ results: [{ id: null, index: 0, outcome: "deleted-everything" }] }],
    [{ wrong: true }],
    ["<html>proxy error</html>"],
  ])("does not accept the malformed answer %j", async (body) => {
    expect(await createApiClient(respond(body)).postEvents(API, TOKEN, [event()])).toMatchObject({ ok: false, kind: "retry" });
  });

  it("reports an invalid token", async () => {
    const result = await createApiClient(respond({ error: "unauthorized" }, { status: 401 })).postEvents(API, TOKEN, [event()]);
    expect(result).toMatchObject({ ok: false, kind: "unauthorized" });
  });

  it("passes on Retry-After, capped at one hour", async () => {
    const limited = await createApiClient(respond({}, { status: 429, headers: { "retry-after": "60" } })).postEvents(API, TOKEN, [event()]);
    const huge = await createApiClient(respond({}, { status: 503, headers: { "retry-after": "999999" } })).postEvents(API, TOKEN, [event()]);
    expect(limited).toMatchObject({ ok: false, kind: "retry", retryAfterMs: 60_000 });
    expect(huge).toMatchObject({ retryAfterMs: 3_600_000 });
  });

  it("treats a network failure as retryable", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await createApiClient(fetchFn).postEvents(API, TOKEN, [event()])).toMatchObject({ ok: false, kind: "retry" });
  });
});

describe("getConfig", () => {
  it("sends the ETag and understands 304", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 304 }));
    const result = await createApiClient(fetchFn).getConfig(API, TOKEN, '"abc"');
    expect(result).toEqual({ ok: true, notModified: true });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["if-none-match"]).toBe('"abc"');
  });

  it("rejects a config whose rules are invalid", async () => {
    const body = { sites: [{ sourceKey: "site:x", domains: ["x.example"], chapterPattern: "(\\d+)+$" }], thresholds: { scrollDepthPercent: 60, watchedPercent: 85 } };
    expect(await createApiClient(respond(body)).getConfig(API, TOKEN, null)).toMatchObject({ ok: false, kind: "retry" });
  });

  it("returns a valid config with its ETag", async () => {
    const body = { sites: [{ sourceKey: "site:x", domains: ["x.example"] }], thresholds: { scrollDepthPercent: 60, watchedPercent: 85 } };
    const result = await createApiClient(respond(body, { headers: { etag: '"v2"' } })).getConfig(API, TOKEN, null);
    expect(result).toEqual({ ok: true, notModified: false, config: body, etag: '"v2"' });
  });
});

describe("pairing", () => {
  it("validates the pairing start answer", async () => {
    const good = { code: "K7P3QX", pollSecret: "s".repeat(43), expiresAt: "2026-10-21T20:10:00.000Z" };
    expect(await createApiClient(respond(good, { status: 201 })).startPairing(API, "Brave")).toEqual({ ok: true, value: good });
    expect(await createApiClient(respond({ ...good, code: "<b>x</b>" }, { status: 201 })).startPairing(API, "Brave")).toMatchObject({
      ok: false,
    });
  });

  it("reports a refused request as rejected, not retryable", async () => {
    expect(await createApiClient(respond({ error: "invalid_request" }, { status: 400 })).startPairing(API, "Brave")).toMatchObject({
      ok: false,
      kind: "rejected",
      status: 400,
    });
  });
});
