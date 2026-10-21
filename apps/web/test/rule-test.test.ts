import { describe, expect, it } from "vitest";
import { evaluateRule, withSampleUrl } from "../src/lib/rule-test";

const site = { sourceKey: "site:reader", domains: ["reader.example"] };

describe("evaluateRule", () => {
  it("runs the generic detection when the rule is empty", () => {
    const result = evaluateRule({}, site, "https://reader.example/manga/solo-leveling/chapter-200");

    expect(result.errors).toEqual({});
    expect(result.results[0]).toMatchObject({
      detection: { chapter: 200, seriesKey: "solo-leveling" },
      next: "https://reader.example/manga/solo-leveling/chapter-201",
    });
  });

  it("applies a valid rule to every sample line, with an optional page title after ' | '", () => {
    const result = evaluateRule(
      { chapterPattern: String.raw`/read/[^/]+/(\d+)`, seriesPattern: String.raw`/read/([^/]+)/`, nextUrlTemplate: "{seriesUrl}/{next}" },
      site,
      ["https://reader.example/read/solo-leveling/200 | Solo Leveling Chapter 200", "", "https://reader.example/read/x/7"].join("\n"),
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      detection: { chapter: 200, seriesKey: "solo-leveling", title: "Solo Leveling" },
      next: "https://reader.example/read/solo-leveling/201",
    });
  });

  it("reports invalid fields and falls back to the generic detection meanwhile", () => {
    const result = evaluateRule({ chapterPattern: "(unclosed" }, site, "https://reader.example/manga/x/chapter-3");

    expect(Object.keys(result.errors)).toEqual(["chapterPattern"]);
    expect(result.results[0]?.detection?.chapter).toBe(3);
    expect(result.usesRule).toBe(false);
  });

  it("shows no detection for a URL the rule does not match", () => {
    const result = evaluateRule({ chapterPattern: String.raw`/c(\d+)$` }, site, "https://reader.example/manga/x/chapter-3");
    expect(result.results[0]?.detection).toBeNull();
  });

  it("ignores lines that are not http(s) URLs", () => {
    const result = evaluateRule({}, site, "javascript:alert(1)");
    expect(result.results[0]).toMatchObject({ detection: null, next: null });
  });

  it("evaluates at most 20 samples", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `https://reader.example/manga/x/chapter-${i}`).join("\n");
    expect(evaluateRule({}, site, lines).results).toHaveLength(20);
  });

  it("validates a site without domains against a placeholder", () => {
    expect(evaluateRule({ chapterPattern: String.raw`/c(\d+)` }, { sourceKey: "site:x", domains: [] }, "").errors).toEqual({});
  });
});

describe("withSampleUrl", () => {
  const recent = ["https://reader.example/manga/x/chapter-2", "https://reader.example/manga/x/chapter-1"];

  it("puts the page the popup came from first", () => {
    expect(withSampleUrl(recent, "https://www.reader.example/manga/y/c5", site.domains)).toEqual([
      "https://www.reader.example/manga/y/c5",
      ...recent,
    ]);
  });

  it("does not repeat a URL that is already a sample", () => {
    expect(withSampleUrl(recent, recent[1], site.domains)).toEqual([recent[1], recent[0]]);
  });

  it.each([["https://evil.example/x"], ["javascript:alert(1)"], [""], [undefined], [["a", "b"]]])("ignores %j", (raw) => {
    expect(withSampleUrl(recent, raw, site.domains)).toEqual(recent);
  });
});
