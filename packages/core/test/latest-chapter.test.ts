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
