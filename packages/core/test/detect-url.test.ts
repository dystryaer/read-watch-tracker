import { describe, expect, it } from "vitest";
import { cleanChapterTitle, detectChapterFromUrl, detectChapterLink } from "../src/detect-url";
import type { SiteRule } from "../src/site-rule";

describe("detectChapterFromUrl – generic", () => {
  it.each([
    [
      "https://asuracomic.net/series/overgeared-7d3f2a1b/chapter/345",
      { chapter: 345, seriesKey: "overgeared", seriesUrl: "https://asuracomic.net/series/overgeared-7d3f2a1b" },
    ],
    [
      "https://mangasite.example/manga/solo-leveling/chapter-200/",
      { chapter: 200, seriesKey: "solo-leveling", seriesUrl: "https://mangasite.example/manga/solo-leveling" },
    ],
    [
      "https://mangasite.example/solo-leveling-chapter-200/",
      { chapter: 200, seriesKey: "solo-leveling", seriesUrl: null },
    ],
    [
      "https://reader.example/title/1234/solo-leveling/ch-5",
      { chapter: 5, seriesKey: "solo-leveling", seriesUrl: "https://reader.example/title/1234/solo-leveling" },
    ],
    [
      "https://reader.example/comic/98765/chapter_12",
      { chapter: 12, seriesKey: "98765", seriesUrl: "https://reader.example/comic/98765" },
    ],
    [
      "https://webtoon.example/en/fantasy/tower-of-god/episode-1/viewer?title_no=95",
      { chapter: 1, seriesKey: "tower-of-god", seriesUrl: "https://webtoon.example/en/fantasy/tower-of-god" },
    ],
  ])("detects %s", (url, expected) => {
    expect(detectChapterFromUrl(url, "")).toMatchObject(expected);
  });

  it.each([
    ["https://site.example/manga/x/chapter-105.5", 105.5],
    ["https://site.example/manga/x/chapter-105-5", 105.5],
    ["https://site.example/manga/x/chapter-12.html", 12],
    ["https://site.example/manga/x/chapter-1-the-beginning", 1],
    ["https://site.example/manga/x/Chapter-7", 7],
    ["https://site.example/manga/x/kapitel-3", 3],
    ["https://site.example/manga/x/chap-0", 0],
  ])("parses the chapter number in %s", (url, chapter) => {
    expect(detectChapterFromUrl(url, "")?.chapter).toBe(chapter);
  });

  it("skips a volume prefix in the chapter segment when looking for the series", () => {
    expect(detectChapterFromUrl("https://site.example/manga/one-piece/vol-105-ch-1100", "")).toMatchObject({
      chapter: 1100,
      seriesKey: "one-piece",
    });
  });

  it("skips a volume segment before the chapter segment when looking for the series", () => {
    expect(detectChapterFromUrl("https://site.example/manga/one-piece/vol-3/chapter-5", "")).toMatchObject({
      chapter: 5,
      seriesKey: "one-piece",
      seriesUrl: "https://site.example/manga/one-piece",
    });
  });

  it("skips generic segments such as /manga/ when looking for the series", () => {
    expect(
      detectChapterFromUrl("https://site.example/manga/chapter-5", "One Piece Chapter 5 - Site"),
    ).toMatchObject({ chapter: 5, seriesKey: "one-piece" });
  });

  it("uses the last chapter token in the path", () => {
    expect(detectChapterFromUrl("https://site.example/chapter-man-2/chapter-12", "")?.chapter).toBe(12);
  });

  it.each([
    ["https://site.example/manga/match-12"],
    ["https://site.example/search?q=chapter-5"],
    ["https://site.example/manga/epic-tale"],
    ["https://site.example/"],
  ])("does not detect a chapter in %s", (url) => {
    expect(detectChapterFromUrl(url, "")).toBeNull();
  });

  it("falls back to the page title when the path has no chapter", () => {
    expect(
      detectChapterFromUrl("https://site.example/read/solo-leveling/200", "Solo Leveling Chapter 200 - Site"),
    ).toMatchObject({ chapter: 200, seriesKey: "solo-leveling", title: "Solo Leveling" });
  });

  it("takes the title from the page title", () => {
    expect(
      detectChapterFromUrl(
        "https://asuracomic.net/series/overgeared-7d3f2a1b/chapter/345",
        "Overgeared Chapter 345 - Asura Scans",
      )?.title,
    ).toBe("Overgeared");
  });

  it("returns a null title when the page title has none", () => {
    expect(detectChapterFromUrl("https://site.example/manga/x/chapter-1", "")?.title).toBeNull();
  });

  it.each([["javascript:alert(1)"], ["not a url"], [`https://site.example/${"a".repeat(2100)}/chapter-1`]])(
    "returns null for the unusable URL %j",
    (url) => {
      expect(detectChapterFromUrl(url, "Chapter 1")).toBeNull();
    },
  );

  it("ignores chapter numbers above the supported maximum", () => {
    expect(detectChapterFromUrl("https://site.example/manga/x/chapter-123456", "")).toBeNull();
  });

  it("accepts a URL object", () => {
    expect(detectChapterFromUrl(new URL("https://site.example/manga/x/chapter-4"), "")?.chapter).toBe(4);
  });
});

describe("detectChapterFromUrl – with a site rule", () => {
  const rule: SiteRule = {
    sourceKey: "site:example",
    domains: ["reader.example"],
    chapterPattern: String.raw`/read/[^/]+/(\d+(?:[._-]\d+)?)`,
    seriesPattern: String.raw`/read/([^/]+)/`,
  };

  it("uses the rule's patterns", () => {
    expect(detectChapterFromUrl("https://reader.example/read/solo-leveling/200", "", rule)).toMatchObject({
      chapter: 200,
      seriesKey: "solo-leveling",
    });
  });

  it("normalizes decimal separators captured by a rule", () => {
    expect(detectChapterFromUrl("https://reader.example/read/x/10_5", "", rule)?.chapter).toBe(10.5);
  });

  it("falls back to the generic series key when only the chapter pattern is set", () => {
    const chapterOnly: SiteRule = { ...rule, seriesPattern: undefined, chapterPattern: String.raw`/c(\d+)$` };
    expect(detectChapterFromUrl("https://reader.example/manga/solo-leveling/c12", "", chapterOnly)).toMatchObject({
      chapter: 12,
      seriesKey: "solo-leveling",
    });
  });

  it("falls back to the title when the rule's series pattern does not match", () => {
    expect(
      detectChapterFromUrl("https://reader.example/other/solo-leveling/200", "Solo Leveling Chapter 200", {
        ...rule,
        chapterPattern: String.raw`/(\d+)$`,
      }),
    ).toMatchObject({ chapter: 200, seriesKey: "solo-leveling", seriesUrl: null });
  });

  it("finds the series before a chapter pattern that starts inside a segment", () => {
    const inSegment: SiteRule = { ...rule, seriesPattern: undefined, chapterPattern: String.raw`chapter-(\d+)` };
    expect(detectChapterFromUrl("https://reader.example/manga/solo-leveling/chapter-3", "", inSegment)).toMatchObject({
      chapter: 3,
      seriesKey: "solo-leveling",
      seriesUrl: "https://reader.example/manga/solo-leveling",
    });
  });

  it("returns null when the rule captures an out-of-range chapter", () => {
    expect(detectChapterFromUrl("https://reader.example/read/x/123456", "", rule)).toBeNull();
  });

  it("returns null when the rule's chapter pattern does not match, without generic guessing", () => {
    expect(detectChapterFromUrl("https://reader.example/manga/x/chapter-3", "", rule)).toBeNull();
  });

  it("ignores an invalid pattern instead of throwing", () => {
    const broken = { ...rule, chapterPattern: "(unclosed" } as SiteRule;
    expect(() => detectChapterFromUrl("https://reader.example/read/x/1", "", broken)).not.toThrow();
  });

  it("runs rule patterns on at most the first 512 characters of the path", () => {
    const tail: SiteRule = { ...rule, seriesPattern: undefined, chapterPattern: String.raw`/c(\d+)$` };
    const near = `https://reader.example/manga/solo-leveling/${"a".repeat(400)}/c12`;
    const far = `https://reader.example/manga/solo-leveling/${"a".repeat(600)}/c12`;

    expect(detectChapterFromUrl(near, "", tail)?.chapter).toBe(12);
    expect(detectChapterFromUrl(far, "", tail)).toBeNull();
  });
});

// Synthetic URLs shaped like a reader whose chapter path (/title/…) is no series page (A11).
describe("detectChapterFromUrl – series page template (SPEC §7.3)", () => {
  const site = { sourceKey: "site:scans", domains: ["scans.example"] };

  it("builds the series page from the template instead of the path before the chapter", () => {
    const rule: SiteRule = { ...site, seriesUrlTemplate: "{origin}/manga/{series}" };
    expect(detectChapterFromUrl("https://scans.example/title/Solo-Leveling/chapter/200.5/1", "", rule)).toEqual({
      chapter: 200.5,
      seriesKey: "solo-leveling",
      title: null,
      seriesUrl: "https://scans.example/manga/Solo-Leveling",
    });
  });

  it("fills in the series as the rule's series pattern captures it", () => {
    const rule: SiteRule = {
      ...site,
      chapterPattern: String.raw`/read/[^/]+/(\d+)`,
      seriesPattern: String.raw`/read/([^/]+)/`,
      seriesUrlTemplate: "https://www.scans.example/series.php?name={series}",
    };
    expect(detectChapterFromUrl("https://scans.example/read/Solo-Leveling/201", "", rule)?.seriesUrl).toBe(
      "https://www.scans.example/series.php?name=Solo-Leveling",
    );
  });

  it("also names a series page when the series stands in the chapter segment", () => {
    const rule: SiteRule = { ...site, seriesUrlTemplate: "{origin}/series/{series}" };
    expect(detectChapterFromUrl("https://scans.example/read/overgeared-chapter-12", "", rule)?.seriesUrl).toBe(
      "https://scans.example/series/overgeared",
    );
  });

  it("names no series page when the series only comes from the page title", () => {
    const rule: SiteRule = { ...site, seriesUrlTemplate: "{origin}/manga/{series}" };
    expect(detectChapterFromUrl("https://scans.example/viewer?id=5", "Overgeared Chapter 12", rule)).toMatchObject({
      chapter: 12,
      seriesKey: "overgeared",
      seriesUrl: null,
    });
  });
});

describe("detectChapterLink – chapter links of a series page (SPEC §7.11)", () => {
  const rule: SiteRule = { sourceKey: "site:scans", domains: ["scans.example"], chapterLinkPattern: String.raw`[?&]chapter=(\d+(?:\.\d+)?)` };

  it("finds the chapter in path and query and names the link's form without it", () => {
    expect(detectChapterLink("https://scans.example/chaptered.php?manga=6&chapter=200.5", rule)).toEqual({
      chapter: 200.5,
      form: "/chaptered.php?manga=6&chapter=#",
    });
    expect(detectChapterLink(new URL("https://scans.example/chaptered.php?chapter=7&manga=6"), rule)?.form).toBe(
      "/chaptered.php?chapter=#&manga=6",
    );
  });

  it.each([
    ["no chapter link pattern", "https://scans.example/chaptered.php?manga=6&chapter=2", { ...rule, chapterLinkPattern: undefined }],
    ["no site rule", "https://scans.example/chaptered.php?manga=6&chapter=2", undefined],
    ["a link the pattern does not match", "https://scans.example/manga/Solo-Leveling", rule],
    ["a chapter beyond the supported maximum", "https://scans.example/chaptered.php?manga=6&chapter=123456", rule],
    ["a link that is no http(s) URL", "javascript:alert('?chapter=1')", rule],
  ])("finds nothing with %s", (_name, url, linkRule) => {
    expect(detectChapterLink(url, linkRule)).toBeNull();
  });
});

describe("cleanChapterTitle", () => {
  it.each([
    ["Overgeared Chapter 345 - Asura Scans", "Overgeared"],
    ["Read Solo Leveling Chapter 200 Online | MangaSite", "Solo Leveling"],
    ["Chapter 345 | Overgeared - Asura Scans", "Overgeared"],
    ["Overgeared - Chapter 345", "Overgeared"],
    ["Overgeared – Ch. 345 – Site", "Overgeared"],
    ["Tower of God - Episode 1 | WEBTOON", "Tower of God"],
    ["Swordmaster’s Youngest Son", "Swordmaster’s Youngest Son"],
    ["Re:Life Player Chapter 65", "Re:Life Player"],
  ])("cleans %j", (raw, expected) => {
    expect(cleanChapterTitle(raw)).toBe(expected);
  });

  it("returns null for an empty or chapter-only title", () => {
    expect(cleanChapterTitle("")).toBeNull();
    expect(cleanChapterTitle("Chapter 12")).toBeNull();
  });

  it("returns null for a title made only of separators", () => {
    expect(cleanChapterTitle(" | ")).toBeNull();
  });

  it("collapses whitespace", () => {
    expect(cleanChapterTitle("  Solo   Leveling\n Chapter 1 ")).toBe("Solo Leveling");
  });
});
