// @vitest-environment happy-dom
import type { SiteRule } from "@rwt/core";
import { beforeEach, describe, expect, it } from "vitest";
import { detectChapter } from "../src/reading/engine";

const URL_ = "https://reader.example/manga/solo-leveling/chapter-200";

function page(head: string, body: string, title = "") {
  document.head.innerHTML = head;
  document.body.innerHTML = body;
  document.title = title;
}

beforeEach(() => page("", ""));

describe("detectChapter", () => {
  it("combines the URL detection with the page title", () => {
    page("", "", "Solo Leveling Chapter 200 - Reader");
    expect(detectChapter(document, URL_)).toEqual({
      chapter: 200,
      seriesKey: "solo-leveling",
      title: "Solo Leveling",
      seriesUrl: "https://reader.example/manga/solo-leveling",
      coverUrl: null,
    });
  });

  it("takes the page's preview image as cover, also from another host", () => {
    page('<meta property="og:image" content="https://cdn.example/thumbnails/Solo Leveling.webp">', "");
    expect(detectChapter(document, URL_)?.coverUrl).toBe("https://cdn.example/thumbnails/Solo%20Leveling.webp");
  });

  it("prefers og:image:secure_url and resolves relative images against the page", () => {
    page('<meta property="og:image" content="http://cdn.example/a.jpg"><meta property="og:image:secure_url" content="/covers/b.jpg">', "");
    expect(detectChapter(document, URL_)?.coverUrl).toBe("https://reader.example/covers/b.jpg");
  });

  it("falls back to twitter:image", () => {
    page('<meta name="twitter:image" content="https://cdn.example/c.png">', "");
    expect(detectChapter(document, URL_)?.coverUrl).toBe("https://cdn.example/c.png");
  });

  it.each([
    ["plain http", "http://cdn.example/a.jpg"],
    ["a script link", "javascript:alert(1)"],
    ["inline data", "data:image/png;base64,AAAA"],
    ["an endless address", `https://cdn.example/${"a".repeat(3000)}.jpg`],
  ])("ignores %s as cover", (_, content) => {
    page(`<meta property="og:image" content="${content}">`, "");
    expect(detectChapter(document, URL_)?.coverUrl).toBeNull();
  });

  it("prefers the rule's title selector", () => {
    page('<meta property="og:title" content="OG Title Chapter 200">', '<h1>H1 Title</h1><div class="series">Selector Title</div>');
    const rule: SiteRule = { sourceKey: "site:reader", domains: ["reader.example"], titleSelector: ".series" };
    expect(detectChapter(document, URL_, rule)?.title).toBe("Selector Title");
  });

  it("uses og:title before h1 and the document title", () => {
    page('<meta property="og:title" content="Solo Leveling Chapter 200 | Reader">', "<h1>Something else</h1>", "Doc Title");
    expect(detectChapter(document, URL_)?.title).toBe("Solo Leveling");
  });

  it("uses the h1 when there is no og:title", () => {
    page("", "<h1>Solo Leveling – Chapter 200</h1>", "Doc Title");
    expect(detectChapter(document, URL_)?.title).toBe("Solo Leveling");
  });

  it("sends the series page named by the rule's template, not the chapter path before the chapter (SPEC §7.3)", () => {
    // Synthetic reader (A11): chapters under /title/<series>/…, the series page under /manga/<series>.
    page("", '<a href="/manga/Solo-Leveling">Solo Leveling</a>', "Solo Leveling Chapter 200");
    const rule: SiteRule = { sourceKey: "site:scans", domains: ["scans.example"], seriesUrlTemplate: "{origin}/manga/{series}" };
    expect(detectChapter(document, "https://scans.example/title/Solo-Leveling/chapter/200/1", rule)).toMatchObject({
      chapter: 200,
      seriesKey: "solo-leveling",
      seriesUrl: "https://scans.example/manga/Solo-Leveling",
    });
  });

  it("ignores an invalid selector instead of failing", () => {
    page("", "<h1>Solo Leveling</h1>");
    const rule: SiteRule = { sourceKey: "site:reader", domains: ["reader.example"], titleSelector: "div[[" };
    expect(detectChapter(document, URL_, rule)?.title).toBe("Solo Leveling");
  });

  it("caps an absurdly long title from the page", () => {
    page("", `<h1>${"x".repeat(5000)}</h1>`);
    expect(detectChapter(document, URL_)?.title?.length).toBeLessThanOrEqual(300);
  });

  it("returns null when the URL is no chapter page", () => {
    page("", "<h1>Solo Leveling</h1>");
    expect(detectChapter(document, "https://reader.example/manga/solo-leveling")).toBeNull();
  });
});
