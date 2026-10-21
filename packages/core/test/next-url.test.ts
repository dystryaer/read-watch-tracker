import { describe, expect, it } from "vitest";
import { nextChapterUrl } from "../src/next-url";

describe("nextChapterUrl – generic", () => {
  it("increments the chapter number in the last path segment", () => {
    expect(
      nextChapterUrl({ lastUrl: "https://site.example/manga/solo-leveling/chapter-216/", chapter: 216 }),
    ).toEqual({ kind: "next", href: "https://site.example/manga/solo-leveling/chapter-217/" });
  });

  it("handles a purely numeric last segment", () => {
    expect(nextChapterUrl({ lastUrl: "https://site.example/series/x/chapter/345", chapter: 345 })).toEqual({
      kind: "next",
      href: "https://site.example/series/x/chapter/346",
    });
  });

  it("goes from a decimal chapter to the next whole chapter", () => {
    expect(nextChapterUrl({ lastUrl: "https://site.example/manga/x/chapter-105-5", chapter: 105.5 })).toEqual({
      kind: "next",
      href: "https://site.example/manga/x/chapter-106",
    });
    expect(nextChapterUrl({ lastUrl: "https://site.example/manga/x/chapter-105.5.html", chapter: 105.5 })).toEqual({
      kind: "next",
      href: "https://site.example/manga/x/chapter-106.html",
    });
  });

  it("does not touch numbers in the query string", () => {
    expect(
      nextChapterUrl({ lastUrl: "https://site.example/manga/x/chapter-12?ref=12", chapter: 12 })?.href,
    ).toBe("https://site.example/manga/x/chapter-13?ref=12");
  });

  it("does not replace the number when it is part of a larger number", () => {
    expect(nextChapterUrl({ lastUrl: "https://site.example/manga/x/chapter-1200", chapter: 12 })).toEqual({
      kind: "last",
      href: "https://site.example/manga/x/chapter-1200",
    });
  });

  it("falls back to the last chapter when the number appears twice", () => {
    expect(nextChapterUrl({ lastUrl: "https://site.example/manga/x/chapter-12-part-12", chapter: 12 })).toEqual({
      kind: "last",
      href: "https://site.example/manga/x/chapter-12-part-12",
    });
  });

  it("falls back to the last chapter when the number is not in the last segment", () => {
    expect(nextChapterUrl({ lastUrl: "https://site.example/chapter-12/page-3", chapter: 12 })?.kind).toBe("last");
  });

  it("falls back to the last chapter when the chapter is unknown", () => {
    expect(nextChapterUrl({ lastUrl: "https://site.example/manga/x/chapter-12", chapter: null })?.kind).toBe("last");
  });

  it("returns null without a usable URL", () => {
    expect(nextChapterUrl({ lastUrl: null, chapter: 12 })).toBeNull();
    expect(nextChapterUrl({ lastUrl: "javascript:alert(1)", chapter: 12 })).toBeNull();
  });
});

describe("nextChapterUrl – template", () => {
  it("fills {seriesUrl} and {next}", () => {
    expect(
      nextChapterUrl({
        lastUrl: "https://asuracomic.net/series/overgeared-7d3f/chapter/345",
        seriesUrl: "https://asuracomic.net/series/overgeared-7d3f",
        chapter: 345,
        template: "{seriesUrl}/chapter/{next}",
      }),
    ).toEqual({ kind: "next", href: "https://asuracomic.net/series/overgeared-7d3f/chapter/346" });
  });

  it("fills {origin} and {series}", () => {
    expect(
      nextChapterUrl({
        lastUrl: "https://reader.example/read/solo-leveling/200",
        seriesUrl: "https://reader.example/read/solo-leveling",
        chapter: 200,
        template: "{origin}/{series}/chapter-{next}",
      })?.href,
    ).toBe("https://reader.example/solo-leveling/chapter-201");
  });

  it("falls back to the generic rule when the template needs a missing seriesUrl", () => {
    expect(
      nextChapterUrl({
        lastUrl: "https://site.example/manga/x/chapter-12",
        chapter: 12,
        template: "{seriesUrl}/chapter/{next}",
      }),
    ).toEqual({ kind: "next", href: "https://site.example/manga/x/chapter-13" });
  });

  it("refuses a template result that is not an http(s) URL", () => {
    expect(
      nextChapterUrl({
        lastUrl: "https://site.example/manga/x/chapter-12-part-12",
        seriesUrl: "https://site.example/manga/x",
        chapter: 12,
        template: "{series}:{next}",
      })?.kind,
    ).toBe("last");
  });
});

describe("nextChapterUrl – domain move", () => {
  it("rewrites the host to the source's current domain", () => {
    expect(
      nextChapterUrl({
        lastUrl: "https://asuracomic.net/series/x/chapter/10",
        chapter: 10,
        currentDomain: "asurascans.com",
      }),
    ).toEqual({ kind: "next", href: "https://asurascans.com/series/x/chapter/11" });
  });

  it("rewrites the host in the fallback link too", () => {
    expect(
      nextChapterUrl({ lastUrl: "https://old.example/manga/x/read", chapter: 10, currentDomain: "new.example" })?.href,
    ).toBe("https://new.example/manga/x/read");
  });

  it("drops a port that belonged to the old domain", () => {
    expect(
      nextChapterUrl({ lastUrl: "https://old.example:8443/x/chapter-1", chapter: 1, currentDomain: "new.example" })?.href,
    ).toBe("https://new.example/x/chapter-2");
  });

  it("ignores an invalid current domain", () => {
    expect(
      nextChapterUrl({ lastUrl: "https://old.example/x/chapter-1", chapter: 1, currentDomain: "bad domain/x" })?.href,
    ).toBe("https://old.example/x/chapter-2");
  });
});
