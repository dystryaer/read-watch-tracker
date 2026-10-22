import { describe, expect, it } from "vitest";
import { latestChapterIn, looksLikeChallenge } from "../src/latest-chapter";
import { SiteRule } from "../src/site-rule";

// Synthetic series pages (A11): no copies of real scanlation pages.
const SERIES = "https://asuracomic.net/series/solo-leveling";

describe("latestChapterIn (SPEC §7.11)", () => {
  it("finds the highest chapter the series page links to", () => {
    const html = `<ul class="chapters">
      <li><a href="/series/solo-leveling/chapter-203">Chapter 203</a></li>
      <li><a href='https://asuracomic.net/series/solo-leveling/chapter-202'>Chapter 202</a></li>
      <li><a href="chapter-201">Chapter 201</a></li>
    </ul>`;
    expect(latestChapterIn(html, SERIES, "solo-leveling")).toBe(203);
  });

  it("ignores other series, other hosts and links that are no chapter", () => {
    const html = `
      <a href="/series/omniscient-reader/chapter-250">Popular</a>
      <a href="https://other.example/series/solo-leveling/chapter-999">Mirror</a>
      <a href="/series/solo-leveling">Back</a>
      <a href="/series/solo-leveling/chapter-200">Chapter 200</a>
      <a href="javascript:alert(1)">x</a>`;
    expect(latestChapterIn(html, SERIES, "solo-leveling")).toBe(200);
  });

  it("accepts www. of the same site and decodes &amp; in links", () => {
    const html = `<a href="https://www.asuracomic.net/series/solo-leveling/chapter-204?from=list&amp;x=1">Chapter 204</a>`;
    expect(latestChapterIn(html, SERIES, "solo-leveling")).toBe(204);
  });

  it("keeps extra chapters like 105.5", () => {
    expect(latestChapterIn(`<a href="/series/solo-leveling/chapter-105-5">105.5</a>`, SERIES, "solo-leveling")).toBe(105.5);
  });

  it("uses the site rule for chapter and series", () => {
    const rule = SiteRule.parse({
      sourceKey: "site:asura",
      domains: ["asuracomic.net"],
      chapterPattern: String.raw`/read/[^/]+/(\d+)$`,
      seriesPattern: String.raw`/read/([^/]+)/\d+$`,
    });
    const html = `<a href="/read/solo-leveling/207">207</a><a href="/read/solo-leveling/206">206</a>`;
    expect(latestChapterIn(html, "https://asuracomic.net/read/solo-leveling", "solo-leveling", rule)).toBe(207);
  });

  it("finds none on a page without chapter links or with a bad page URL", () => {
    expect(latestChapterIn("<p>Loading…</p>", SERIES, "solo-leveling")).toBeNull();
    expect(latestChapterIn(`<a href="/series/solo-leveling/chapter-1">1</a>`, "javascript:x", "solo-leveling")).toBeNull();
  });

  it("reads long chapter lists to the end, oldest chapter first", () => {
    const html = Array.from(
      { length: 2000 },
      (_, index) =>
        `<a href="/series/solo-leveling/chapter-${index + 1}"><img alt=""></a><a href="/series/solo-leveling/chapter-${index + 1}">${index + 1}</a><a href="/comments/${index}">c</a>`,
    ).join("");
    expect(latestChapterIn(html, SERIES, "solo-leveling")).toBe(2000);
  });

  it("resolves relative links against a page URL that ends in a slash", () => {
    expect(latestChapterIn(`<a href="chapter-204">204</a>`, `${SERIES}/`, "solo-leveling")).toBe(204);
  });

  it("stops after its time budget and keeps what it found, so a slow site rule cannot stall the extension", () => {
    const html = Array.from({ length: 50 }, (_, index) => `<a href="/series/solo-leveling/chapter-${index + 1}">x</a>`).join("");
    let time = 0;
    expect(latestChapterIn(html, SERIES, "solo-leveling", undefined, { budgetMs: 5, now: () => time++ })).toBe(5);
  });

  it("checks each link only once and skips links without a number", () => {
    let calls = 0;
    const html = `${`<a href="/series/solo-leveling/chapter-7">x</a>`.repeat(100)}${`<a href="/about">a</a>`.repeat(100)}`;
    expect(latestChapterIn(html, SERIES, "solo-leveling", undefined, { budgetMs: 1000, now: () => (calls++, 0) })).toBe(7);
    expect(calls).toBeLessThan(5);
  });

  describe("with a chapter link pattern: links that carry the chapter only in the query", () => {
    // Shaped like a series page whose list links to a redirect script, without the series' slug.
    const PAGE = "https://scans.example/manga/Solo-Leveling";
    const rule = SiteRule.parse({ sourceKey: "site:scans", domains: ["scans.example"], chapterLinkPattern: String.raw`[?&]chapter=(\d+(?:\.\d+)?)` });
    const list = (manga: number, chapters: number[]) =>
      chapters.map((chapter) => `<li><a  href="/chaptered.php?manga=${manga}&amp;chapter=${chapter}" class="chplinks">Chapter ${chapter}</a></li>`).join("\n");

    it("finds none without the pattern: the links name neither series nor chapter in the path", () => {
      expect(latestChapterIn(list(6, [200.5, 200, 199]), PAGE, "solo-leveling")).toBeNull();
    });

    it("finds the newest chapter of the list", () => {
      const html = `<a id="read-first" href="/chaptered.php?manga=6&chapter=0">First</a><ul>${list(6, [200.5, 200, 199])}</ul>`;
      expect(latestChapterIn(html, PAGE, "solo-leveling", rule)).toBe(200.5);
    });

    it("ignores the chapters of other series in a sidebar: the series' own list is the most common link form", () => {
      const html = `<aside>${list(12, [350, 349])}${list(31, [80])}</aside><ul>${list(6, [200, 199, 198])}</ul>`;
      expect(latestChapterIn(html, PAGE, "solo-leveling", rule)).toBe(200);
    });

    it("reports nothing when two link forms are equally common: which one is the series is unclear", () => {
      const html = `${list(12, [350, 349])}${list(6, [2, 1])}`;
      expect(latestChapterIn(html, PAGE, "solo-leveling", rule)).toBeNull();
    });

    it("still counts the links the chapter detection recognizes for this series", () => {
      const html = `<a href="/title/Solo-Leveling/chapter/201/1">201</a>${list(6, [200, 199])}`;
      expect(latestChapterIn(html, PAGE, "solo-leveling", rule)).toBe(201);
    });

    it("ignores matching links on other hosts", () => {
      expect(latestChapterIn(`<a href="https://other.example/chaptered.php?manga=6&chapter=999">x</a>`, PAGE, "solo-leveling", rule)).toBeNull();
    });
  });

  it("does not read oversized pages", () => {
    const html = `<a href="/series/solo-leveling/chapter-200">200</a>${" ".repeat(2 * 1024 * 1024)}`;
    expect(latestChapterIn(html, SERIES, "solo-leveling")).toBeNull();
  });
});

describe("looksLikeChallenge", () => {
  it.each([
    ["Cloudflare", `<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1"></script></body></html>`],
    ["Cloudflare block", `<title>Attention Required! | Cloudflare</title>`],
    ["DDoS-Guard", `<html><body><div id="ddg-cookie">DDoS-Guard</div></body></html>`],
    ["DataDome", `<script src="https://ct.captcha-delivery.com/c.js"></script>`],
  ])("recognizes a %s challenge page", (_name, html) => {
    expect(looksLikeChallenge(html)).toBe(true);
  });

  it("does not flag an ordinary series page", () => {
    expect(looksLikeChallenge(`<title>Solo Leveling – Asura</title><a href="/series/solo-leveling/chapter-200">Chapter 200</a>`)).toBe(false);
  });
});
