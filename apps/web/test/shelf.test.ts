import type { OverviewRow } from "@rwt/server";
import { describe, expect, it } from "vitest";
import { type OverviewItem, toOverviewItem } from "../src/lib/overview";
import { cardAction, coverPosition, parseOverviewView, plusLabel, VIEW_COOKIE, viewCookie } from "../src/lib/shelf";

const NOW = new Date("2026-10-21T20:00:00.000Z");

function item(overrides: Partial<OverviewRow> = {}): OverviewItem {
  return toOverviewItem(
    {
      id: "0b6c3c1e-7f43-4c5f-9a43-5d5fbb4f0c11",
      type: "manhwa",
      title: "Overgeared",
      status: "reading",
      chapter: 345,
      season: null,
      episode: null,
      percent: null,
      lastUrl: null,
      lastProgressAt: null,
      latestChapter: null,
      source: null,
      seriesUrl: null,
      aliases: [],
      coverVersion: null,
      ...overrides,
    },
    NOW,
  );
}

const asura = { key: "site:asura", name: "Asura", kind: "website" as const, currentDomain: "asuracomic.net", nextUrlTemplate: null };
const reading = { source: asura, lastUrl: "https://asuracomic.net/series/overgeared/chapter/345" };

describe("overview view (Regal | Liste)", () => {
  it("is the shelf unless the browser remembered the list", () => {
    expect(parseOverviewView(undefined)).toBe("shelf");
    expect(parseOverviewView("shelf")).toBe("shelf");
    expect(parseOverviewView("list")).toBe("list");
    expect(parseOverviewView("<script>")).toBe("shelf");
  });

  it("is remembered for a year in a cookie for the whole app", () => {
    expect(viewCookie("list")).toBe(`${VIEW_COOKIE}=list; Path=/; Max-Age=31536000; SameSite=Lax`);
  });
});

describe("coverPosition: what the picture shows", () => {
  it("shows the newest chapter beside the one read, and how many are new", () => {
    const work = item({ chapter: 345, latestChapter: 348 });
    expect(coverPosition(work, 345)).toEqual({ label: "Kap. 345", unknown: false, latest: 348, fresh: 3 });
  });

  it("follows the stepper before the save has answered", () => {
    const work = item({ chapter: 345, latestChapter: 348 });
    expect(coverPosition(work, 347)).toEqual({ label: "Kap. 347", unknown: false, latest: 348, fresh: 1 });
    expect(coverPosition(work, 348)).toEqual({ label: "Kap. 348", unknown: false, latest: 348, fresh: null });
  });

  it("leaves out a newest chapter the reader is already past", () => {
    expect(coverPosition(item({ chapter: 350, latestChapter: 348 }), 350).latest).toBeNull();
    expect(coverPosition(item({ chapter: 348.5, latestChapter: 348 }), 348.5).latest).toBe(348);
  });

  it("shows the chapter alone when the newest one is not known", () => {
    expect(coverPosition(item({ chapter: 332 }), 332)).toEqual({ label: "Kap. 332", unknown: false, latest: null, fresh: null });
  });

  it("marks an unknown chapter", () => {
    expect(coverPosition(item({ chapter: null, latestChapter: 50 }), null)).toEqual({ label: "Kap. ?", unknown: true, latest: null, fresh: null });
  });

  it("shows episodes, percentages and films as the list does", () => {
    const anime = item({ type: "anime", chapter: null, season: 1, episode: 14 });
    expect(coverPosition(anime, 15)).toEqual({ label: "S1 · F15", unknown: false, latest: null, fresh: null });
    const ebook = item({ type: "ebook", chapter: null, percent: 43 });
    expect(coverPosition(ebook, null)).toEqual({ label: "43 %", unknown: false, latest: null, fresh: null });
    expect(coverPosition(item({ type: "ebook", chapter: null }), null)).toMatchObject({ label: "? %", unknown: true });
    expect(coverPosition(item({ type: "movie", chapter: null }), null)).toMatchObject({ label: "Film", unknown: false });
  });
});

describe("cardAction: the button row under the picture", () => {
  it("continues reading, with the short word on phones, and offers +", () => {
    expect(cardAction(item(reading))).toEqual({
      action: { kind: "continue", href: "https://asuracomic.net/series/overgeared/chapter/346", label: "Weiterlesen", short: "Weiter" },
      plus: true,
    });
  });

  it("shortens “Zuletzt gelesen” and keeps “Öffnen”", () => {
    const last = cardAction(item({ source: asura, lastUrl: "https://asuracomic.net/series/overgeared/reader" }));
    expect(last.action).toMatchObject({ kind: "continue", label: "Zuletzt gelesen", short: "Zuletzt" });
    const crunchyroll = { key: "crunchyroll", name: "Crunchyroll", kind: "streaming" as const, currentDomain: null, nextUrlTemplate: null };
    const anime = cardAction(
      item({ type: "anime", chapter: null, season: 1, episode: 14, source: crunchyroll, seriesUrl: "https://www.crunchyroll.com/series/GG5H5XQX4" }),
    );
    expect(anime).toEqual({
      action: { kind: "continue", href: "https://www.crunchyroll.com/series/GG5H5XQX4", label: "Öffnen", short: "Öffnen" },
      plus: true,
    });
  });

  it("sends an unknown position to the detail page to set it", () => {
    expect(cardAction(item({ chapter: null }))).toEqual({
      action: { kind: "set-position", href: "/works/0b6c3c1e-7f43-4c5f-9a43-5d5fbb4f0c11" },
      plus: false,
    });
    expect(cardAction(item({ type: "ebook", chapter: null })).action.kind).toBe("set-position");
  });

  it("shows an e-book's percentage instead of a button", () => {
    expect(cardAction(item({ type: "ebook", chapter: null, percent: 43.5 }))).toEqual({
      action: { kind: "note", label: "Stand: 43,5 %" },
      plus: false,
    });
  });

  it("says when a work is finished or dropped, without +", () => {
    expect(cardAction(item({ ...reading, status: "completed" }))).toEqual({ action: { kind: "note", label: "Abgeschlossen" }, plus: false });
    expect(cardAction(item({ ...reading, status: "dropped" }))).toEqual({ action: { kind: "note", label: "Abgebrochen" }, plus: false });
  });

  it("says why there is no link: no page yet, or none to build", () => {
    expect(cardAction(item())).toEqual({ action: { kind: "note", label: "Keine Seite" }, plus: true });
    const webnovel = { key: "webnovel", name: "WebNovel", kind: "app" as const, currentDomain: null, nextUrlTemplate: null };
    expect(cardAction(item({ type: "light_novel", chapter: 1204, source: webnovel }))).toEqual({
      action: { kind: "note", label: "Kein Link" },
      plus: true,
    });
    expect(cardAction(item({ type: "movie", chapter: null }))).toEqual({ action: { kind: "note", label: "Keine Seite" }, plus: false });
  });
});

describe("plusLabel", () => {
  it("names the chapter or episode that + marks", () => {
    expect(plusLabel("Eleceed", { unit: "chapter", value: 421, season: null }, 421)).toBe("Eleceed: Kapitel 422 als gelesen markieren");
    expect(plusLabel("Eleceed", { unit: "chapter", value: 421, season: null }, 105.5)).toBe("Eleceed: Kapitel 106 als gelesen markieren");
    expect(plusLabel("Frieren", { unit: "episode", value: 14, season: 1 }, 14)).toBe("Frieren: Folge 15 als gesehen markieren");
  });
});
