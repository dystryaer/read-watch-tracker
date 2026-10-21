import { describe, expect, it } from "vitest";
import { compileRulePattern, SiteRule } from "../src/site-rule";

const baseRule = { sourceKey: "site:asura", domains: ["asuracomic.net"] };

describe("SiteRule", () => {
  it("accepts a rule without overrides", () => {
    expect(SiteRule.safeParse(baseRule).success).toBe(true);
  });

  it("accepts a complete rule", () => {
    const rule = {
      ...baseRule,
      domains: ["asuracomic.net", "asurascans.com"],
      chapterPattern: String.raw`/chapter/(\d+(?:\.\d+)?)`,
      seriesPattern: String.raw`/series/([^/]+)`,
      titleSelector: "h1.series-title",
      endSelector: "a.next-chapter",
      nextUrlTemplate: "{seriesUrl}/chapter/{next}",
    };
    expect(SiteRule.safeParse(rule).success).toBe(true);
  });

  it("lowercases domains", () => {
    expect(SiteRule.parse({ ...baseRule, domains: ["AsuraComic.NET"] }).domains).toEqual([
      "asuracomic.net",
    ]);
  });

  it.each([
    [[]],
    [["not a domain"]],
    [["https://asuracomic.net"]],
    [["asuracomic.net/path"]],
    [["-bad.example"]],
    [Array.from({ length: 51 }, (_, i) => `d${i}.example`)],
  ])("rejects the domain list %j", (domains) => {
    expect(SiteRule.safeParse({ ...baseRule, domains }).success).toBe(false);
  });

  it("accepts up to 50 domains, as many as a source can collect through domain moves", () => {
    const domains = Array.from({ length: 50 }, (_, i) => `d${i}.example`);
    expect(SiteRule.safeParse({ ...baseRule, domains }).success).toBe(true);
  });

  it("accepts localhost with a port-free name for local testing", () => {
    expect(SiteRule.safeParse({ ...baseRule, domains: ["localhost"] }).success).toBe(true);
  });

  it("rejects a pattern that does not compile", () => {
    expect(SiteRule.safeParse({ ...baseRule, chapterPattern: "(unclosed" }).success).toBe(false);
  });

  it("rejects a pattern without a capture group", () => {
    expect(SiteRule.safeParse({ ...baseRule, chapterPattern: String.raw`chapter-\d+` }).success).toBe(
      false,
    );
  });

  it("rejects a pattern longer than 200 characters", () => {
    const chapterPattern = `(${"a".repeat(200)})`;
    expect(SiteRule.safeParse({ ...baseRule, chapterPattern }).success).toBe(false);
  });

  it.each([
    [String.raw`(\d+)+$`],
    [String.raw`((a+)*)`],
    [String.raw`(\w*){2,}`],
    // Bypasses of the earlier nested-quantifier heuristic (security review M1).
    [String.raw`/chapter-((\d+))+x`],
    [String.raw`((?:\d|\d)*)x`],
    [String.raw`(?:-\d)*(\d+)`],
    [String.raw`(\d){3}`],
  ])("rejects the repeated group %j", (chapterPattern) => {
    const result = SiteRule.safeParse({ ...baseRule, chapterPattern });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/nur mit \? optional/);
  });

  it.each([[String.raw`(\d+)-\1`], [String.raw`(?<n>\d+)\k<n>`]])("rejects the backreference %j", (chapterPattern) => {
    const result = SiteRule.safeParse({ ...baseRule, chapterPattern });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/Rückverweise/);
  });

  it.each([
    [String.raw`/chapter/(\d+(?:\.\d+)?)`],
    [String.raw`(?:-(\d+))?$`],
    [String.raw`\)+(\d+)`],
    [String.raw`[)]+(\d+)`],
    [String.raw`[\]()]*(\d+)`],
    [String.raw`chapter-(\d+)[\1]`],
  ])("accepts the safe pattern %j", (chapterPattern) => {
    expect(SiteRule.safeParse({ ...baseRule, chapterPattern }).success).toBe(true);
  });

  it("rejects an unknown placeholder in the next-URL template", () => {
    expect(SiteRule.safeParse({ ...baseRule, nextUrlTemplate: "{origin}/{evil}" }).success).toBe(
      false,
    );
  });

  it("rejects a next-URL template that could start with another scheme", () => {
    expect(
      SiteRule.safeParse({ ...baseRule, nextUrlTemplate: "javascript:{next}" }).success,
    ).toBe(false);
  });

  it("rejects overly long selectors", () => {
    expect(SiteRule.safeParse({ ...baseRule, titleSelector: "a".repeat(201) }).success).toBe(false);
  });
});

describe("compileRulePattern", () => {
  it("compiles case-insensitively", () => {
    expect(compileRulePattern(String.raw`/Chapter/(\d+)`)?.test("/chapter/5")).toBe(true);
  });

  it("returns null for an invalid pattern instead of throwing", () => {
    expect(compileRulePattern("(unclosed")).toBeNull();
  });
});
