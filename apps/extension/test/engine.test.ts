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
    });
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
