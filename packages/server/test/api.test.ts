import { type DbHandle, events } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type ApiContext,
  createApiLimiters,
  handleConfig,
  handleEnableSource,
  handleEvents,
  handleIgnoreSeries,
  handlePairingPoll,
  handlePairingStart,
} from "../src/api/handlers";
import { approvePairing, createDeviceWithToken, revokeDevice } from "../src/devices";
import { chapterEvent, seedSource } from "./helpers";

let handle: DbHandle;
let context: ApiContext;
let token: string;

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle?.close();
});
beforeEach(async () => {
  await resetDb(handle.db);
  context = { db: handle.db, limiters: createApiLimiters() };
  ({ token } = await createDeviceWithToken(handle.db, { kind: "extension", name: "Brave" }));
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/v1/events", () => {
  it("rejects a request without token", async () => {
    const response = await handleEvents(post("/api/v1/events", { events: [chapterEvent()] }, { authorization: "" }), context);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("rejects a revoked device", async () => {
    const device = await createDeviceWithToken(handle.db, { kind: "shield", name: "Shield" });
    await revokeDevice(handle.db, device.device.id);
    const response = await handleEvents(
      post("/api/v1/events", { events: [chapterEvent()] }, { authorization: `Bearer ${device.token}` }),
      context,
    );
    expect(response.status).toBe(401);
  });

  it("processes valid events and reports rejected ones individually, in order", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    const good = chapterEvent();
    const bad = { ...chapterEvent(), source: { ...chapterEvent().source, url: "javascript:alert(1)" } };

    const response = await handleEvents(post("/api/v1/events", { events: [bad, good] }), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.results).toEqual([
      { id: bad.id, index: 0, outcome: "rejected", reason: expect.stringContaining("source.url") },
      { id: good.id, index: 1, outcome: "pending" },
    ]);
    expect(await handle.db.select().from(events)).toHaveLength(1);
  });

  it("records the sending device on the event", async () => {
    const response = await handleEvents(post("/api/v1/events", { events: [chapterEvent()] }), context);
    expect(response.status).toBe(200);
    const [stored] = await handle.db.select().from(events);
    expect(stored?.deviceId).not.toBeNull();
  });

  it("answers 413 for more than 100 events", async () => {
    const response = await handleEvents(
      post("/api/v1/events", { events: Array.from({ length: 101 }, () => chapterEvent()) }),
      context,
    );
    expect(response.status).toBe(413);
  });

  it("answers 413 for an oversized body", async () => {
    const response = await handleEvents(post("/api/v1/events", `{"events":["${"x".repeat(600_000)}"]}`), context);
    expect(response.status).toBe(413);
  });

  it("answers 400 for invalid JSON", async () => {
    expect((await handleEvents(post("/api/v1/events", "{not json"), context)).status).toBe(400);
  });

  it("answers 400 for a malformed batch", async () => {
    expect((await handleEvents(post("/api/v1/events", { events: "x" }), context)).status).toBe(400);
  });

  it("answers 415 for a non-JSON content type", async () => {
    const response = await handleEvents(post("/api/v1/events", "events=1", { "content-type": "text/plain" }), context);
    expect(response.status).toBe(415);
  });

  it("limits failed token checks per client address", async () => {
    const limited: ApiContext = { ...context, limiters: createApiLimiters({ authFailuresPerMinute: 2 }) };
    const attempt = () =>
      handleEvents(post("/api/v1/events", { events: [chapterEvent()] }, { authorization: `Bearer ${"X".repeat(43)}`, "x-forwarded-for": "10.0.0.9" }), limited);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });

  it("answers 429 when a device sends too many requests", async () => {
    const limited: ApiContext = { ...context, limiters: createApiLimiters({ eventsPerMinute: 1 }) };
    await handleEvents(post("/api/v1/events", { events: [chapterEvent()] }), limited);
    const response = await handleEvents(post("/api/v1/events", { events: [chapterEvent()] }), limited);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});

describe("GET /api/v1/config", () => {
  function get(headers: Record<string, string> = {}) {
    return new Request("http://localhost/api/v1/config", { headers: { authorization: `Bearer ${token}`, ...headers } });
  }

  it("requires a token", async () => {
    expect((await handleConfig(get({ authorization: "Bearer nope" }), context)).status).toBe(401);
  });

  it("returns the site rules with an ETag and answers 304 when unchanged", async () => {
    await seedSource(handle.db, { key: "site:asura" }, ["asuracomic.net"]);

    const first = await handleConfig(get(), context);
    const etag = first.headers.get("etag");
    const second = await handleConfig(get({ "if-none-match": etag ?? "" }), context);

    expect(first.status).toBe(200);
    expect((await first.json()).sites[0].sourceKey).toBe("site:asura");
    expect(etag).toMatch(/^"[0-9a-f]{16,}"$/);
    expect(second.status).toBe(304);
  });
});

describe("pairing endpoints", () => {
  it("starts a pairing without authentication", async () => {
    const response = await handlePairingStart(post("/api/v1/pairing", { kind: "shield", name: "Shield" }, { authorization: "" }), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ code: expect.stringMatching(/^[A-Z0-9]{6}$/) });
  });

  it("rejects a phone pairing request", async () => {
    const response = await handlePairingStart(post("/api/v1/pairing", { kind: "phone", name: "iPhone" }), context);
    expect(response.status).toBe(400);
  });

  it("delivers the token through polling after approval", async () => {
    const start = await (await handlePairingStart(post("/api/v1/pairing", { kind: "extension", name: "Brave" }), context)).json();
    const pending = await (await handlePairingPoll(post("/api/v1/pairing/poll", { pollSecret: start.pollSecret }), context)).json();
    await approvePairing(handle.db, start.code, undefined);
    const approved = await (await handlePairingPoll(post("/api/v1/pairing/poll", { pollSecret: start.pollSecret }), context)).json();

    expect(pending).toEqual({ status: "pending" });
    expect(approved).toMatchObject({ status: "approved", deviceToken: expect.any(String) });
  });

  it("limits pairing starts per client address", async () => {
    const limited: ApiContext = { ...context, limiters: createApiLimiters({ pairingStartsPerMinute: 1 }) };
    const request = () => post("/api/v1/pairing", { kind: "shield", name: "Shield" }, { "x-forwarded-for": "10.0.0.1" });
    await handlePairingStart(request(), limited);
    expect((await handlePairingStart(request(), limited)).status).toBe(429);
  });
});

describe("POST /api/v1/sources/enable", () => {
  it("enables a new site for the extension", async () => {
    const response = await handleEnableSource(post("/api/v1/sources/enable", { origin: "https://asuracomic.net" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sourceKey: "site:asuracomic-net", name: "asuracomic.net", domains: ["asuracomic.net"] });
  });

  it("answers 404 for a move from an unknown source", async () => {
    const response = await handleEnableSource(
      post("/api/v1/sources/enable", { origin: "https://new.example", moveFromSourceKey: "site:missing" }),
      context,
    );
    expect(response.status).toBe(404);
  });

  it("answers 409 when the domain belongs to another source", async () => {
    await seedSource(handle.db, { key: "site:a" }, ["a.example"]);
    await seedSource(handle.db, { key: "site:b" }, ["b.example"]);
    const response = await handleEnableSource(
      post("/api/v1/sources/enable", { origin: "https://a.example", moveFromSourceKey: "site:b" }),
      context,
    );
    expect(response.status).toBe(409);
  });

  it("answers 400 for a path instead of an origin", async () => {
    const response = await handleEnableSource(post("/api/v1/sources/enable", { origin: "https://a.example/x" }), context);
    expect(response.status).toBe(400);
  });

  it("is reserved for the browser extension", async () => {
    const shield = await createDeviceWithToken(handle.db, { kind: "shield", name: "Shield" });
    const response = await handleEnableSource(
      post("/api/v1/sources/enable", { origin: "https://a.example" }, { authorization: `Bearer ${shield.token}` }),
      context,
    );
    expect(response.status).toBe(403);
  });

  it("requires a token", async () => {
    const response = await handleEnableSource(
      post("/api/v1/sources/enable", { origin: "https://a.example" }, { authorization: "" }),
      context,
    );
    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/ignore", () => {
  it("ignores a series for the extension", async () => {
    await seedSource(handle.db, { key: "site:asura" });
    const response = await handleIgnoreSeries(
      post("/api/v1/ignore", { sourceKey: "site:asura", externalKey: "news", rawTitle: "News" }),
      context,
    );
    expect(response.status).toBe(200);
  });

  it("answers 404 for an unknown source", async () => {
    const response = await handleIgnoreSeries(post("/api/v1/ignore", { sourceKey: "site:x", externalKey: "a", rawTitle: "A" }), context);
    expect(response.status).toBe(404);
  });

  it("answers 400 for a malformed request", async () => {
    const response = await handleIgnoreSeries(post("/api/v1/ignore", { sourceKey: "<x>", externalKey: "", rawTitle: "" }), context);
    expect(response.status).toBe(400);
  });

  it("is reserved for the browser extension", async () => {
    const shield = await createDeviceWithToken(handle.db, { kind: "shield", name: "Shield" });
    const response = await handleIgnoreSeries(
      post("/api/v1/ignore", { sourceKey: "site:asura", externalKey: "a", rawTitle: "A" }, { authorization: `Bearer ${shield.token}` }),
      context,
    );
    expect(response.status).toBe(403);
  });
});
