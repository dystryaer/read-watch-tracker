import type { OverviewRow } from "@rwt/server";
import { describe, expect, it } from "vitest";
import { filterAndSort, formatRelative, type OverviewItem, toOverviewItem } from "../src/lib/overview";

const NOW = new Date("2026-10-21T20:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function row(overrides: Partial<OverviewRow> = {}): OverviewRow {
  return {
    id: crypto.randomUUID(),
    type: "manhwa",
    title: "Overgeared",
    status: "reading",
    chapter: 344,
    season: null,
    episode: null,
    percent: null,
    lastUrl: null,
    lastProgressAt: null,
    source: null,
    seriesUrl: null,
    aliases: [],
    ...overrides,
  };
}

const asura = {
  key: "site:asura",
  name: "Asura",
  kind: "website" as const,
  currentDomain: "asuracomic.net",
  nextUrlTemplate: null,
};

describe("toOverviewItem – position", () => {
  it.each([
    [row({ chapter: 216 }), "Kap. 216", false],
    [row({ chapter: 105.5 }), "Kap. 105.5", false],
    [row({ chapter: null }), "Kap. ?", true],
    [row({ type: "anime", chapter: null, season: 1, episode: 14 }), "S1 · F14", false],
    [row({ type: "series", chapter: null, episode: 3 }), "F3", false],
    [row({ type: "anime", chapter: null }), "F ?", true],
    [row({ type: "ebook", chapter: null, percent: 43 }), "43 %", false],
    [row({ type: "ebook", chapter: null, percent: 43.5 }), "43,5 %", false],
    [row({ type: "ebook", chapter: null }), "? %", true],
    [row({ type: "movie", chapter: null }), "Film", false],
    [row({ type: "movie", chapter: null, status: "completed" }), "Gesehen", false],
  ])("labels %#", (input, label, unknown) => {
    const item = toOverviewItem(input, NOW);
    expect(item.positionLabel).toBe(label);
    expect(item.positionUnknown).toBe(unknown);
  });

  it("labels the media type in German", () => {
    expect(toOverviewItem(row({ type: "light_novel" }), NOW).typeLabel).toBe("Novel");
    expect(toOverviewItem(row({ type: "series", chapter: null }), NOW).typeLabel).toBe("Serie");
  });
});

describe("toOverviewItem – source", () => {
  it("shows the current domain of a website with its initial", () => {
    expect(toOverviewItem(row({ source: asura }), NOW).source).toEqual({ label: "asuracomic.net", initial: "A" });
  });

  it("shows the name of a streaming service", () => {
    const source = { key: "crunchyroll", name: "Crunchyroll", kind: "streaming" as const, currentDomain: null, nextUrlTemplate: null };
    expect(toOverviewItem(row({ type: "anime", chapter: null, source }), NOW).source).toEqual({
      label: "Crunchyroll",
      initial: "C",
    });
  });

  it("uses a question mark when the name has no letter", () => {
    const source = { ...asura, name: "123", currentDomain: null };
    expect(toOverviewItem(row({ source }), NOW).source?.initial).toBe("?");
  });

  it("is null for imported works", () => {
    expect(toOverviewItem(row(), NOW).source).toBeNull();
  });
});

describe("toOverviewItem – continue link", () => {
  it("links the next chapter", () => {
    const item = toOverviewItem(
      row({ chapter: 345, source: asura, lastUrl: "https://asuracomic.net/series/overgeared/chapter/345" }),
      NOW,
    );
    expect(item.continueLink).toEqual({ href: "https://asuracomic.net/series/overgeared/chapter/346", label: "Weiterlesen" });
  });

  it("uses the source's template and current domain", () => {
    const item = toOverviewItem(
      row({
        chapter: 10,
        source: { ...asura, currentDomain: "asurascans.com", nextUrlTemplate: "{seriesUrl}/ch/{next}" },
        lastUrl: "https://asuracomic.net/series/x/chapter/10",
        seriesUrl: "https://asuracomic.net/series/x",
      }),
      NOW,
    );
    expect(item.continueLink?.href).toBe("https://asurascans.com/series/x/ch/11");
  });

  it("falls back to the last chapter when the next one cannot be derived", () => {
    const item = toOverviewItem(row({ chapter: 12, source: asura, lastUrl: "https://asuracomic.net/read/x" }), NOW);
    expect(item.continueLink).toEqual({ href: "https://asuracomic.net/read/x", label: "Zuletzt gelesen" });
  });

  it("opens the series page for anime", () => {
    const item = toOverviewItem(
      row({ type: "anime", chapter: null, episode: 3, seriesUrl: "https://www.crunchyroll.com/series/GG5H5XQX4/frieren" }),
      NOW,
    );
    expect(item.continueLink).toEqual({ href: "https://www.crunchyroll.com/series/GG5H5XQX4/frieren", label: "Öffnen" });
  });

  it.each([["javascript:alert(document.cookie)"], ["data:text/html,<script>alert(1)</script>"]])(
    "never produces a script link from %j",
    (url) => {
      expect(toOverviewItem(row({ source: asura, lastUrl: url }), NOW).continueLink).toBeNull();
      expect(toOverviewItem(row({ type: "anime", chapter: null, seriesUrl: url }), NOW).continueLink).toBeNull();
    },
  );

  it("has no link without a URL", () => {
    expect(toOverviewItem(row(), NOW).continueLink).toBeNull();
  });
});

describe("formatRelative", () => {
  it.each([
    [new Date(NOW.getTime() - 20_000), "gerade eben"],
    [new Date(NOW.getTime() - 5 * 60_000), "vor 5 Min."],
    [hoursAgo(2), "vor 2 Std."],
    [hoursAgo(30), "gestern"],
    [hoursAgo(24 * 3), "vor 3 Tagen"],
    [hoursAgo(24 * 14), "vor 2 Wochen"],
    [hoursAgo(24 * 90), "vor 3 Monaten"],
    [hoursAgo(24 * 800), "vor 2 Jahren"],
  ])("formats %s", (date, label) => {
    expect(formatRelative(date, NOW)).toBe(label);
  });
});

describe("filterAndSort", () => {
  const items: OverviewItem[] = [
    toOverviewItem(row({ title: "Swordmaster’s Youngest Son", chapter: 216, lastProgressAt: hoursAgo(2) }), NOW),
    toOverviewItem(row({ title: "Ärger im Turm", chapter: null }), NOW),
    toOverviewItem(row({ title: "Frieren", type: "anime", chapter: null, episode: 14, lastProgressAt: hoursAgo(20) }), NOW),
    toOverviewItem(row({ title: "Solo Leveling", status: "completed", chapter: 200, aliases: ["Only I Level Up"] }), NOW),
    toOverviewItem(row({ title: "Shadow Slave", type: "light_novel", chapter: 1204, lastProgressAt: hoursAgo(72) }), NOW),
  ];
  const base = { tab: "all", status: "reading", query: "", unknownOnly: false, sort: "recent" } as const;
  const titles = (list: OverviewItem[]) => list.map((item) => item.title);

  it("shows works being read, most recent first, never-active ones last", () => {
    expect(titles(filterAndSort(items, base))).toEqual([
      "Swordmaster’s Youngest Son",
      "Frieren",
      "Shadow Slave",
      "Ärger im Turm",
    ]);
  });

  it("sorts by title with German collation", () => {
    expect(titles(filterAndSort(items, { ...base, sort: "title" }))).toEqual([
      "Ärger im Turm",
      "Frieren",
      "Shadow Slave",
      "Swordmaster’s Youngest Son",
    ]);
  });

  it.each([
    ["comics", ["Swordmaster’s Youngest Son", "Ärger im Turm"]],
    ["novels", ["Shadow Slave"]],
    ["video", ["Frieren"]],
    ["ebooks", []],
  ] as const)("filters the %s tab", (tab, expected) => {
    expect(titles(filterAndSort(items, { ...base, tab }))).toEqual(expected);
  });

  it("filters by status", () => {
    expect(titles(filterAndSort(items, { ...base, status: "completed" }))).toEqual(["Solo Leveling"]);
    expect(filterAndSort(items, { ...base, status: "all" })).toHaveLength(5);
  });

  it("shows only works with unknown position", () => {
    expect(titles(filterAndSort(items, { ...base, unknownOnly: true }))).toEqual(["Ärger im Turm"]);
  });

  it("searches normalized titles", () => {
    expect(titles(filterAndSort(items, { ...base, query: "swordmasters" }))).toEqual(["Swordmaster’s Youngest Son"]);
    expect(titles(filterAndSort(items, { ...base, query: "SWORDMASTER'S youngest" }))).toEqual(["Swordmaster’s Youngest Son"]);
  });

  it("searches aliases", () => {
    expect(titles(filterAndSort(items, { ...base, status: "all", query: "only i level" }))).toEqual(["Solo Leveling"]);
  });

  it("ignores a query made only of punctuation", () => {
    expect(filterAndSort(items, { ...base, query: " ?! " })).toHaveLength(4);
  });
});
