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
  handleLatestChapters,
  handlePairingPoll,
  handlePairingStart,
  handleShare,
  handleSeriesWatch,
  handleShareConfirm,
} from "../src/api/handlers";
import { approvePairing, createDeviceWithToken, revokeDevice } from "../src/devices";
import { chapterEvent, seedLink, seedSource, seedWork } from "./helpers";

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

describe("share endpoints (iOS shortcut)", () => {
  const book = { url: "https://m.webnovel.com/book/22196546206090805", text: "Shadow Slave" };
  let phone: string;

  beforeEach(async () => {
    ({ token: phone } = await createDeviceWithToken(handle.db, { kind: "phone", name: "iPhone" }));
  });

  const asPhone = (path: string, body: unknown) => post(path, body, { authorization: `Bearer ${phone}` });

  it("walks a share from the book to the saved chapter", async () => {
    const started = await handleShare(asPhone("/api/v1/share", book), context);
    expect(started.status).toBe(200);
    const share = await started.json();
    expect(share).toMatchObject({ title: "Shadow Slave", unit: "chapter", needsMatch: true });

    const confirmed = await handleShareConfirm(asPhone("/api/v1/share/confirm", { shareId: share.shareId, chapter: "12" }), context);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ outcome: "pending", title: "Shadow Slave", message: "Neuer Titel – bitte im Tracker zuordnen" });
  });

  it("explains a link it does not know", async () => {
    const response = await handleShare(asPhone("/api/v1/share", { url: "https://www.example.com/x" }), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "unknown_link", message: expect.stringContaining("WebNovel") });
  });

  it("says a share was saved already when the shortcut sends twice", async () => {
    const share = await (await handleShare(asPhone("/api/v1/share", book), context)).json();
    await handleShareConfirm(asPhone("/api/v1/share/confirm", { shareId: share.shareId, chapter: 12 }), context);

    const again = await handleShareConfirm(asPhone("/api/v1/share/confirm", { shareId: share.shareId, chapter: 12 }), context);

    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "share_used", message: expect.stringContaining("gespeichert") });
  });

  it("explains an expired or used share", async () => {
    const response = await handleShareConfirm(asPhone("/api/v1/share/confirm", { shareId: crypto.randomUUID(), chapter: 1 }), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "share_not_found", message: expect.any(String) });
  });

  it("refuses a number that does not fit the book", async () => {
    const share = await (await handleShare(asPhone("/api/v1/share", book), context)).json();
    const response = await handleShareConfirm(asPhone("/api/v1/share/confirm", { shareId: share.shareId, percent: 40 }), context);
    expect(response.status).toBe(400);
  });

  it("explains a revoked token in words the shortcut can show", async () => {
    const response = await handleShare(post("/api/v1/share", book, { authorization: `Bearer ${"Z".repeat(43)}` }), context);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized", message: expect.stringContaining("Kurzbefehl") });
  });

  it("accepts phone tokens only", async () => {
    const response = await handleShare(post("/api/v1/share", book, { authorization: `Bearer ${token}` }), context);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "forbidden", message: expect.stringContaining("iPhone") });
  });

  it("keeps a phone token to the share endpoints: a leaked shortcut cannot send events or read the rules", async () => {
    const events = await handleEvents(asPhone("/api/v1/events", { events: [chapterEvent()] }), context);
    const config = await handleConfig(new Request("http://localhost/api/v1/config", { headers: { authorization: `Bearer ${phone}` } }), context);

    expect(events.status).toBe(403);
    expect(config.status).toBe(403);
  });

  it("explains every refusal in words the shortcut can show", async () => {
    const malformed = await handleShare(asPhone("/api/v1/share", "{not json"), context);
    const empty = await handleShare(asPhone("/api/v1/share", {}), context);
    const tooLong = await handleShare(asPhone("/api/v1/share", { text: "x".repeat(20_000) }), context);
    const plainText = await handleShare(post("/api/v1/share", "Shadow Slave", { authorization: `Bearer ${phone}`, "content-type": "text/plain" }), context);

    for (const [response, status] of [[malformed, 400], [empty, 400], [tooLong, 413], [plainText, 415]] as const) {
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: expect.any(String), message: expect.any(String) });
    }
  });

  it("explains the rate limit and keeps its retry header", async () => {
    context = { db: handle.db, limiters: createApiLimiters({ sharesPerMinute: 1 }) };
    await handleShare(asPhone("/api/v1/share", book), context);

    const response = await handleShare(asPhone("/api/v1/share", book), context);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toMatchObject({ error: "rate_limited", message: expect.stringContaining("Minute") });
  });

  it("refuses a number in a form other than plain digits, without using up the share", async () => {
    const share = await (await handleShare(asPhone("/api/v1/share", book), context)).json();

    for (const chapter of ["1e3", "0x10", "", "12.345"]) {
      const response = await handleShareConfirm(asPhone("/api/v1/share/confirm", { shareId: share.shareId, chapter }), context);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ message: expect.any(String) });
    }
    const saved = await handleShareConfirm(asPhone("/api/v1/share/confirm", { shareId: share.shareId, chapter: "12,5" }), context);
    expect(saved.status).toBe(200);
  });

  it("limits shares per device", async () => {
    context = { db: handle.db, limiters: createApiLimiters({ sharesPerMinute: 2 }) };
    await handleShare(asPhone("/api/v1/share", book), context);
    await handleShare(asPhone("/api/v1/share", book), context);
    expect((await handleShare(asPhone("/api/v1/share", book), context)).status).toBe(429);
  });
});

describe("new chapter endpoints (M4, SPEC §7.11)", () => {
  const get = (authorization = `Bearer ${token}`) => new Request("http://localhost/api/v1/series-watch", { headers: { authorization } });

  async function readingSoloLeveling() {
    const source = await seedSource(handle.db, { key: "site:asura", trackingEnabled: true }, ["asuracomic.net"]);
    const work = await seedWork(handle.db, { title: "Solo Leveling", chapter: 200 });
    await seedLink(handle.db, {
      workId: work.id,
      sourceId: source.id,
      externalKey: "solo-leveling",
      externalTitle: "Solo Leveling",
      seriesUrl: "https://asuracomic.net/series/solo-leveling",
    });
  }

  it("gives the extension the series pages to check", async () => {
    await readingSoloLeveling();
    const response = await handleSeriesWatch(get(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      series: [{ sourceKey: "site:asura", externalKey: "solo-leveling", seriesUrl: "https://asuracomic.net/series/solo-leveling", chapter: 200 }],
    });
  });

  it("takes the newest chapters the extension found", async () => {
    await readingSoloLeveling();
    const response = await handleLatestChapters(
      post("/api/v1/latest-chapters", { items: [{ sourceKey: "site:asura", externalKey: "solo-leveling", latestChapter: 203 }] }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 1 });
  });

  it.each([
    ["a chapter with three decimals", { items: [{ sourceKey: "site:asura", externalKey: "x", latestChapter: 1.234 }] }],
    ["a chapter beyond the position range", { items: [{ sourceKey: "site:asura", externalKey: "x", latestChapter: 100_000 }] }],
    ["an empty list", { items: [] }],
    ["more than 100 items", { items: Array.from({ length: 101 }, () => ({ sourceKey: "site:asura", externalKey: "x", latestChapter: 1 })) }],
    ["a bad source key", { items: [{ sourceKey: "Site Asura", externalKey: "x", latestChapter: 1 }] }],
  ])("refuses %s", async (_name, body) => {
    expect((await handleLatestChapters(post("/api/v1/latest-chapters", body), context)).status).toBe(400);
  });

  it("refuses oversized reports and too many requests", async () => {
    const oversized = await handleLatestChapters(post("/api/v1/latest-chapters", `{"items":["${"x".repeat(200_000)}"]}`), context);
    expect(oversized.status).toBe(413);

    const limited: ApiContext = { ...context, limiters: createApiLimiters({ newChaptersPerMinute: 1 }) };
    await handleSeriesWatch(get(), limited);
    expect((await handleSeriesWatch(get(), limited)).status).toBe(429);
  });

  it("serves extensions only", async () => {
    const shield = (await createDeviceWithToken(handle.db, { kind: "shield", name: "Shield" })).token;
    const phone = (await createDeviceWithToken(handle.db, { kind: "phone", name: "iPhone" })).token;
    const item = { items: [{ sourceKey: "site:asura", externalKey: "x", latestChapter: 1 }] };

    for (const other of [shield, phone]) {
      expect((await handleSeriesWatch(get(`Bearer ${other}`), context)).status).toBe(403);
      expect((await handleLatestChapters(post("/api/v1/latest-chapters", item, { authorization: `Bearer ${other}` }), context)).status).toBe(403);
    }
    expect((await handleSeriesWatch(get("Bearer nope"), context)).status).toBe(401);
  });
});
