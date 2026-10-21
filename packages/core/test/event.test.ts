import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ProgressEvent, parseEventBatch, Position } from "../src/event";

const validEvent = {
  id: "3f1c2a4e-8b7d-4c3a-9e2f-1a2b3c4d5e6f",
  occurredAt: "2026-10-21T18:30:00Z",
  kind: "read",
  source: {
    key: "site:asura",
    externalKey: "overgeared",
    rawTitle: "Overgeared",
    url: "https://asuracomic.net/series/overgeared/chapter/345",
  },
  position: { unit: "chapter", chapter: 345 },
};

function withSource(overrides: Record<string, unknown>) {
  return { ...validEvent, source: { ...validEvent.source, ...overrides } };
}

describe("ProgressEvent", () => {
  it("accepts a valid chapter event", () => {
    expect(ProgressEvent.safeParse(validEvent).success).toBe(true);
  });

  it("accepts timestamps with an offset", () => {
    const event = { ...validEvent, occurredAt: "2026-10-21T20:30:00+02:00" };
    expect(ProgressEvent.safeParse(event).success).toBe(true);
  });

  it("strips unknown fields instead of storing them", () => {
    const parsed = ProgressEvent.parse({ ...validEvent, extra: "<script>" });
    expect(parsed).not.toHaveProperty("extra");
  });

  it("rejects an id that is not a UUID", () => {
    expect(ProgressEvent.safeParse({ ...validEvent, id: "1" }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(ProgressEvent.safeParse({ ...validEvent, kind: "manual" }).success).toBe(false);
  });

  it("rejects a malformed timestamp", () => {
    expect(ProgressEvent.safeParse({ ...validEvent, occurredAt: "yesterday" }).success).toBe(false);
  });

  describe("source", () => {
    it.each([["javascript:alert(1)"], ["data:text/html,x"], ["ftp://example.org/x"]])(
      "rejects the url %j",
      (url) => {
        expect(ProgressEvent.safeParse(withSource({ url })).success).toBe(false);
      },
    );

    it("rejects a dangerous seriesUrl", () => {
      expect(ProgressEvent.safeParse(withSource({ seriesUrl: "javascript:alert(1)" })).success).toBe(
        false,
      );
    });

    it("accepts a missing url", () => {
      expect(ProgressEvent.safeParse(withSource({ url: undefined })).success).toBe(true);
    });

    it.each([["Site:Asura"], ["site asura"], [""], ["a".repeat(101)], ["<script>"]])(
      "rejects the source key %j",
      (key) => {
        expect(ProgressEvent.safeParse(withSource({ key })).success).toBe(false);
      },
    );

    it("replaces control characters in the title and trims it", () => {
      const parsed = ProgressEvent.parse(withSource({ rawTitle: "  Over\u0000geared\n " }));
      expect(parsed.source.rawTitle).toBe("Over geared");
    });

    it("rejects a title that is empty after trimming", () => {
      expect(ProgressEvent.safeParse(withSource({ rawTitle: " \n\t " })).success).toBe(false);
    });

    it("rejects a title longer than 300 characters", () => {
      expect(ProgressEvent.safeParse(withSource({ rawTitle: "a".repeat(301) })).success).toBe(false);
    });

    it("rejects an external key longer than 300 characters", () => {
      expect(ProgressEvent.safeParse(withSource({ externalKey: "a".repeat(301) })).success).toBe(
        false,
      );
    });
  });
});

describe("Position", () => {
  it.each([
    [{ unit: "chapter", chapter: 0 }],
    [{ unit: "chapter", chapter: 105.5 }],
    [{ unit: "chapter", chapter: 99999.99 }],
    [{ unit: "episode", season: 2, episode: 5 }],
    [{ unit: "episode", season: null, episode: 1 }],
    [{ unit: "percent", percent: 0 }],
    [{ unit: "percent", percent: 43.25 }],
    [{ unit: "percent", percent: 100 }],
    [{ unit: "none" }],
  ])("accepts %j", (position) => {
    expect(Position.safeParse(position).success).toBe(true);
  });

  it.each([
    [{ unit: "chapter", chapter: -1 }],
    [{ unit: "chapter", chapter: 100000 }],
    [{ unit: "chapter", chapter: 1.234 }],
    [{ unit: "chapter", chapter: Number.NaN }],
    [{ unit: "chapter", chapter: Number.POSITIVE_INFINITY }],
    [{ unit: "chapter", chapter: "12" }],
    [{ unit: "episode", season: 0, episode: 1 }],
    [{ unit: "episode", season: 1, episode: 0 }],
    [{ unit: "episode", season: 1, episode: 1.5 }],
    [{ unit: "episode", episode: 1 }],
    [{ unit: "percent", percent: 100.01 }],
    [{ unit: "percent", percent: -0.5 }],
    [{ unit: "pages", pages: 3 }],
  ])("rejects %j", (position) => {
    expect(Position.safeParse(position).success).toBe(false);
  });
});

describe("parseEventBatch", () => {
  it("validates each event separately so one bad event does not reject the batch", () => {
    const badEvent = { ...validEvent, id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", kind: "nope" };
    const result = parseEventBatch({ events: [validEvent, badEvent] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]).toMatchObject({ ok: true, index: 0 });
    expect(result.items[1]).toMatchObject({
      ok: false,
      index: 1,
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
  });

  it("reports a null id when a rejected event has no usable id", () => {
    const result = parseEventBatch({ events: [{ id: 42 }] });
    expect(result.ok && result.items[0]).toMatchObject({ ok: false, id: null, index: 0 });
  });

  it("gives a short reason for a rejected event", () => {
    const result = parseEventBatch({ events: [{ ...validEvent, kind: "nope" }] });
    expect(result.ok && !result.items[0]?.ok && result.items[0]?.reason).toMatch(/kind/);
  });

  it.each([[{ events: [] }], [{}], [null], ["events"], [{ events: "x" }]])(
    "rejects the malformed batch %j",
    (body) => {
      expect(parseEventBatch(body).ok).toBe(false);
    },
  );

  it("accepts exactly 100 events", () => {
    const events = Array.from({ length: 100 }, () => validEvent);
    expect(parseEventBatch({ events }).ok).toBe(true);
  });

  it("rejects more than 100 events", () => {
    const events = Array.from({ length: 101 }, () => validEvent);
    const result = parseEventBatch({ events });
    expect(result).toMatchObject({ ok: false, error: "too_many_events" });
  });
});

describe("event.schema.json", () => {
  it("matches the zod contract (update with `pnpm test -u`)", async () => {
    const schema = z.toJSONSchema(ProgressEvent, { io: "input" });
    await expect(`${JSON.stringify(schema, null, 2)}\n`).toMatchFileSnapshot("../event.schema.json");
  });
});
