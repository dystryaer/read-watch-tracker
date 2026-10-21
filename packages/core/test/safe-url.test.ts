import { describe, expect, it } from "vitest";
import { parseHttpUrl, safeHref } from "../src/safe-url";

describe("parseHttpUrl", () => {
  it.each([
    ["https://asuracomic.net/series/overgeared/chapter/345"],
    ["http://localhost:3000/chapter-1"],
    ["HTTPS://Example.org/Path"],
  ])("accepts %j", (value) => {
    expect(parseHttpUrl(value)).toBeInstanceOf(URL);
  });

  it.each([
    ["javascript:alert(1)"],
    ["JavaScript:alert(document.cookie)"],
    [" javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
    ["file:///C:/Windows/win.ini"],
    ["chrome-extension://abc/popup.html"],
    ["//evil.example/path"],
    ["/relative/path"],
    ["not a url"],
    [""],
  ])("rejects %j", (value) => {
    expect(parseHttpUrl(value)).toBeNull();
  });

  it("rejects an http prefix that is not a parseable URL", () => {
    expect(parseHttpUrl("http://")).toBeNull();
  });

  it("rejects URLs longer than 2048 characters", () => {
    const longUrl = `https://example.org/${"a".repeat(2048)}`;
    expect(parseHttpUrl(longUrl)).toBeNull();
  });

  it("rejects URLs with embedded credentials", () => {
    expect(parseHttpUrl("https://user:secret@example.org/")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(parseHttpUrl(undefined)).toBeNull();
    expect(parseHttpUrl(42)).toBeNull();
  });
});

describe("safeHref", () => {
  it("returns the normalized URL for http(s) values", () => {
    expect(safeHref("https://example.org/a b")).toBe("https://example.org/a%20b");
  });

  it("returns undefined for dangerous or missing values", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});
