import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OverviewRow } from "@rwt/server";
import { describe, expect, it } from "vitest";
import { toOverviewItem } from "../src/lib/overview";
import { lastCheckLabel, toUpdateItem, type UpdateItem, updateLink, updateSections, updatesSummary } from "../src/lib/updates";
import { UPDATES_PAGE, worksWithNewChaptersLabel } from "../src/lib/updates-page";

const NOW = new Date("2026-10-22T20:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const asura = {
  key: "site:asura",
  name: "Asura",
  kind: "website" as const,
  currentDomain: "asuracomic.net",
  nextUrlTemplate: null,
};

function row(overrides: Partial<OverviewRow> = {}): OverviewRow {
  return {
    id: crypto.randomUUID(),
    type: "manhwa",
    title: "Overgeared",
    status: "reading",
    chapter: 345,
    season: null,
    episode: null,
    percent: null,
    lastUrl: "https://asuracomic.net/series/overgeared/chapter/345",
    lastProgressAt: hoursAgo(2),
    latestChapter: null,
    source: asura,
    seriesUrl: "https://asuracomic.net/series/overgeared",
    aliases: [],
    coverVersion: null,
    ...overrides,
  };
}

const shown = (input: OverviewRow) => toUpdateItem(input, NOW) !== null;

describe("UPDATES_PAGE", () => {
  it("names the page in one place, and its route folder has the same path", () => {
    expect(UPDATES_PAGE).toEqual({ path: "/updates", label: "Updates" });
    const page = fileURLToPath(new URL(`../src/app/(app)${UPDATES_PAGE.path}/page.tsx`, import.meta.url));
    expect(existsSync(page)).toBe(true);
  });

  it.each([
    [1, "1 Werk mit neuen Kapiteln"],
    [5, "5 Werke mit neuen Kapiteln"],
  ])("says the navigation's number in words for screen readers (%i)", (count, label) => {
    expect(worksWithNewChaptersLabel(count)).toBe(label);
  });
});

describe("toUpdateItem – which works the page shows (SPEC §4.9)", () => {
  it.each([
    ["a manhwa being read, nothing new", row(), true],
    ["a manga being read, never checked", row({ type: "manga", latestChapter: null }), true],
    ["a manhua being read with new chapters", row({ type: "manhua", latestChapter: 350 }), true],
    ["an unknown position (Kap. ?)", row({ chapter: null, latestChapter: 12 }), false],
    ["a finished work with new chapters", row({ status: "completed", latestChapter: 346 }), true],
    ["a finished work without", row({ status: "completed", latestChapter: 345 }), false],
    ["a dropped work with new chapters", row({ status: "dropped", latestChapter: 400 }), true],
    ["a dropped work never checked", row({ status: "dropped" }), false],
    ["a light novel with new chapters", row({ type: "light_novel", chapter: 1204, latestChapter: 1210 }), true],
    ["a light novel without", row({ type: "light_novel", chapter: 1204 }), false],
    ["an e-book", row({ type: "ebook", chapter: null, percent: 43 }), false],
    ["an anime", row({ type: "anime", chapter: null, season: 1, episode: 14 }), false],
    ["a known chapter without any reading page", row({ lastUrl: null, seriesUrl: null, source: null }), true],
  ])("%s → %s", (_case, input, expected) => {
    expect(shown(input)).toBe(expected);
  });

  it("counts whole chapters beyond the one read, as the badge in the list", () => {
    expect(toUpdateItem(row({ chapter: 470.5, latestChapter: 472 }), NOW)?.newChapters).toBe(2);
    expect(toUpdateItem(row({ chapter: 470.5, latestChapter: 470.9 }), NOW)?.newChapters).toBe(0);
    // The series page lists only part of its chapters (e.g. the first 50): nothing new.
    expect(toUpdateItem(row({ chapter: 345, latestChapter: 40 }), NOW)?.newChapters).toBe(0);
  });

  it("shows the position under the title, with the newest chapter when there is more", () => {
    expect(toUpdateItem(row({ chapter: 345, latestChapter: 348 }), NOW)).toMatchObject({ positionLabel: "Kap. 345", latestLabel: "von 348" });
    expect(toUpdateItem(row({ chapter: 105.5 }), NOW)).toMatchObject({ positionLabel: "Kap. 105.5", latestLabel: null });
  });

  it("says what sets a work apart from a comic being read", () => {
    expect(toUpdateItem(row(), NOW)?.note).toBeNull();
    expect(toUpdateItem(row({ status: "completed", latestChapter: 400 }), NOW)?.note).toBe("Abgeschlossen");
    expect(toUpdateItem(row({ status: "dropped", latestChapter: 400 }), NOW)?.note).toBe("Abgebrochen");
    expect(toUpdateItem(row({ type: "light_novel", status: "completed", latestChapter: 400 }), NOW)?.note).toBe("Light Novel · Abgeschlossen");
  });

  it("carries the stored picture, or none for the tile", () => {
    const id = "0b6c3c1e-7f43-4c5f-9a43-5d5fbb4f0c11";
    expect(toUpdateItem(row({ id, coverVersion: 1792600000000 }), NOW)?.cover).toBe(`/works/${id}/cover?v=1792600000000`);
    expect(toUpdateItem(row(), NOW)?.cover).toBeNull();
  });
});

describe("updateLink – where the picture leads", () => {
  it("opens the first unread chapter n+1 when there are new chapters", () => {
    expect(updateLink(row({ chapter: 345, latestChapter: 348 }))).toEqual({
      kind: "next",
      href: "https://asuracomic.net/series/overgeared/chapter/346",
    });
  });

  it("starts after a part chapter: 470.5 leads to 471", () => {
    const input = row({ chapter: 470.5, latestChapter: 472, lastUrl: "https://asuracomic.net/series/tdg/chapter/470.5" });
    expect(updateLink(input)?.href).toBe("https://asuracomic.net/series/tdg/chapter/471");
  });

  it.each([
    ["generic rule", row({ latestChapter: 348 })],
    ["the source's template on its current domain", row({
      chapter: 10,
      latestChapter: 12,
      source: { ...asura, currentDomain: "asurascans.com", nextUrlTemplate: "{seriesUrl}/ch/{next}" },
      lastUrl: "https://asuracomic.net/series/x/chapter/10",
      seriesUrl: "https://asuracomic.net/series/x",
    })],
    ["no derivable n+1", row({ chapter: 12, latestChapter: 14, lastUrl: "https://asuracomic.net/read/x" })],
    ["a domain move", row({ latestChapter: 348, source: { ...asura, currentDomain: "asurascans.com" } })],
  ])("with new chapters it is the same address as „Weiterlesen“ in the list (%s)", (_case, input) => {
    expect(updateLink(input)?.href).toBe(toOverviewItem(input, NOW).continueLink?.href);
  });

  it("opens the newest chapter, i.e. the last one read, when nothing is new", () => {
    expect(updateLink(row({ latestChapter: 345 }))).toEqual({ kind: "last", href: "https://asuracomic.net/series/overgeared/chapter/345" });
    expect(updateLink(row({ latestChapter: null }))).toEqual({ kind: "last", href: "https://asuracomic.net/series/overgeared/chapter/345" });
  });

  it("puts the last chapter read on the source's current domain after a domain move", () => {
    const input = row({ source: { ...asura, currentDomain: "asurascans.com" } });
    expect(updateLink(input)?.href).toBe("https://asurascans.com/series/overgeared/chapter/345");
  });

  it("has none without a reading page", () => {
    expect(updateLink(row({ lastUrl: null, seriesUrl: null, source: null }))).toBeNull();
    expect(updateLink(row({ lastUrl: null, latestChapter: 400 }))).toBeNull();
  });

  it.each([["javascript:alert(document.cookie)"], ["data:text/html,<script>alert(1)</script>"]])("never links a script from %j", (url) => {
    expect(updateLink(row({ lastUrl: url }))).toBeNull();
    expect(updateLink(row({ lastUrl: url, latestChapter: 400 }))).toBeNull();
  });
});

describe("toUpdateItem – labels of the picture link", () => {
  it("names title, chapter, news and the new tab in full", () => {
    expect(toUpdateItem(row({ latestChapter: 348 }), NOW)?.link).toEqual({
      href: "https://asuracomic.net/series/overgeared/chapter/346",
      label: "Overgeared: Kapitel 346 lesen (3 neue Kapitel, öffnet neuen Tab)",
      cta: "Kap. 346 lesen",
    });
    expect(toUpdateItem(row({ latestChapter: 346 }), NOW)?.link?.label).toBe("Overgeared: Kapitel 346 lesen (1 neues Kapitel, öffnet neuen Tab)");
  });

  it("says when it reopens the last chapter read", () => {
    expect(toUpdateItem(row(), NOW)?.link).toEqual({
      href: "https://asuracomic.net/series/overgeared/chapter/345",
      label: "Overgeared: zuletzt gelesenes Kapitel 345 öffnen (öffnet neuen Tab)",
      cta: "Zuletzt gelesen",
    });
    const noPattern = row({ chapter: 12, latestChapter: 14, lastUrl: "https://asuracomic.net/read/x" });
    expect(toUpdateItem(noPattern, NOW)?.link?.label).toBe("Overgeared: zuletzt gelesenes Kapitel 12 öffnen (2 neue Kapitel, öffnet neuen Tab)");
  });

  it("has no link without a reading page; the work is shown greyed out", () => {
    expect(toUpdateItem(row({ lastUrl: null, seriesUrl: null, source: null }), NOW)?.link).toBeNull();
  });
});

describe("updateSections – order and the switch „Alle | Nur neue“", () => {
  const item = (title: string, newChapters: number, lastProgressAt: number | null): UpdateItem => ({
    id: title,
    title,
    cover: null,
    positionLabel: "Kap. 1",
    latestLabel: null,
    newChapters,
    note: null,
    lastProgressAt,
    link: null,
  });
  const items = [
    item("Eleceed", 2, 26),
    item("Absolute Sword Sense", 0, 50),
    item("Overgeared", 3, 2),
    item("Arcane Sniper", 0, null),
    item("Tales of Demons and Gods", 5, 120),
    item("Nano Machine", 0, 5),
    item("One Piece", 1, null),
  ].map((entry) => ({ ...entry, lastProgressAt: entry.lastProgressAt === null ? null : hoursAgo(entry.lastProgressAt).getTime() }));
  const titles = (list: UpdateItem[]) => list.map((entry) => entry.title);

  it("puts works with new chapters on top, last read first, never-read ones last", () => {
    const { fresh, rest } = updateSections(items, { sort: "recent", show: "all" });
    expect(titles(fresh)).toEqual(["Overgeared", "Eleceed", "Tales of Demons and Gods", "One Piece"]);
    expect(titles(rest)).toEqual(["Nano Machine", "Absolute Sword Sense", "Arcane Sniper"]);
  });

  it("sorts by most new chapters on request, then by last read", () => {
    const { fresh, rest } = updateSections([...items, { ...item("Eleceed 2", 3, null) }], { sort: "most", show: "all" });
    expect(titles(fresh)).toEqual(["Tales of Demons and Gods", "Overgeared", "Eleceed 2", "Eleceed", "One Piece"]);
    expect(titles(rest)).toEqual(["Nano Machine", "Absolute Sword Sense", "Arcane Sniper"]);
  });

  it("breaks ties by title", () => {
    const same = [item("b", 1, 7), item("A", 1, 7), item("c", 1, 7)];
    expect(titles(updateSections(same, { sort: "recent", show: "all" }).fresh)).toEqual(["A", "b", "c"]);
  });

  it("„Nur neue“ leaves only the works with new chapters", () => {
    const { fresh, rest } = updateSections(items, { sort: "recent", show: "new" });
    expect(fresh).toHaveLength(4);
    expect(rest).toEqual([]);
  });

  it("does not change the list it is given", () => {
    const before = titles(items);
    updateSections(items, { sort: "most", show: "all" });
    expect(titles(items)).toEqual(before);
  });
});

describe("updatesSummary and lastCheckLabel", () => {
  it("sums up works and chapters waiting", () => {
    const fresh = [toUpdateItem(row({ latestChapter: 348 }), NOW), toUpdateItem(row({ latestChapter: 346 }), NOW), toUpdateItem(row(), NOW)];
    expect(updatesSummary(fresh.filter((entry) => entry !== null))).toBe("2 Werke mit neuen Kapiteln · 4 Kapitel zu lesen");
    expect(updatesSummary([toUpdateItem(row({ latestChapter: 346 }), NOW)].filter((entry) => entry !== null))).toBe(
      "1 Werk mit neuen Kapiteln · 1 Kapitel zu lesen",
    );
    expect(updatesSummary([])).toBe("Gerade nichts Neues");
  });

  it("says when the series pages were last checked", () => {
    expect(lastCheckLabel(hoursAgo(2), NOW)).toBe("Serienseiten zuletzt geprüft vor 2 Std.");
    expect(lastCheckLabel(null, NOW)).toBe("Serienseiten noch nie geprüft");
  });
});
