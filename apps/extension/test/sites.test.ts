import type { DeviceConfig } from "@rwt/core";
import { describe, expect, it, vi } from "vitest";
import { findSiteForUrl, readerPatterns, ruleEditorUrl, syncReaderScripts } from "../src/lib/sites";

const config: DeviceConfig = {
  sites: [
    { sourceKey: "site:asura", domains: ["asuracomic.net", "asurascans.com"], chapterPattern: String.raw`/chapter/(\d+)` },
    { sourceKey: "site:other", domains: ["other.example"] },
  ],
  thresholds: { scrollDepthPercent: 60, watchedPercent: 85 },
};

function fakeScripting(registered: { id: string; matches?: string[] }[] = []) {
  const scripts = new Map(registered.map((script) => [script.id, script]));
  return {
    scripts,
    getRegisteredContentScripts: vi.fn(async () => [...scripts.values()]),
    registerContentScripts: vi.fn(async (list: { id: string; matches?: string[] }[]) => {
      for (const script of list) scripts.set(script.id, script);
    }),
    unregisterContentScripts: vi.fn(async ({ ids }: { ids?: string[] }) => {
      for (const id of ids ?? []) scripts.delete(id);
    }),
  };
}

describe("readerPatterns", () => {
  it("covers the bare and www host over http and https", () => {
    expect(readerPatterns("asuracomic.net")).toEqual([
      "https://asuracomic.net/*",
      "http://asuracomic.net/*",
      "https://www.asuracomic.net/*",
      "http://www.asuracomic.net/*",
    ]);
  });
});

describe("findSiteForUrl", () => {
  it("finds the site of a current or old domain, also with www", () => {
    expect(findSiteForUrl(config, "https://www.asurascans.com/series/x/chapter/1")?.sourceKey).toBe("site:asura");
    expect(findSiteForUrl(config, "https://asuracomic.net/series/x")?.sourceKey).toBe("site:asura");
  });

  it("returns undefined for other sites and unusable URLs", () => {
    expect(findSiteForUrl(config, "https://evil.example/")).toBeUndefined();
    expect(findSiteForUrl(config, "https://asuracomic.net.evil.example/")).toBeUndefined();
    expect(findSiteForUrl(config, "javascript:alert(1)")).toBeUndefined();
  });
});

describe("syncReaderScripts", () => {
  it("registers one reader script per site with all its domains", async () => {
    const scripting = fakeScripting();

    await syncReaderScripts(scripting, config);

    expect(scripting.scripts.get("reader:site:asura")?.matches).toEqual([
      ...readerPatterns("asuracomic.net"),
      ...readerPatterns("asurascans.com"),
    ]);
    expect(scripting.scripts.has("reader:site:other")).toBe(true);
  });

  it("removes scripts of sites that are no longer enabled and leaves others alone", async () => {
    const scripting = fakeScripting([{ id: "reader:site:gone", matches: ["https://gone.example/*"] }, { id: "streaming:netflix" }]);

    await syncReaderScripts(scripting, config);

    expect(scripting.scripts.has("reader:site:gone")).toBe(false);
    expect(scripting.scripts.has("streaming:netflix")).toBe(true);
  });

  it("updates a site whose domains changed", async () => {
    const scripting = fakeScripting([{ id: "reader:site:asura", matches: readerPatterns("asuracomic.net") }]);

    await syncReaderScripts(scripting, config);

    expect(scripting.scripts.get("reader:site:asura")?.matches).toHaveLength(8);
  });

  it("unregisters everything without a config", async () => {
    const scripting = fakeScripting([{ id: "reader:site:asura", matches: [] }]);
    await syncReaderScripts(scripting, null);
    expect(scripting.scripts.size).toBe(0);
  });
});

describe("ruleEditorUrl", () => {
  it("opens the site's rule editor with the current page as test URL", () => {
    expect(ruleEditorUrl("https://tracker.example", "site:asura", "https://asuracomic.net/series/x/chapter/5?a=1&b=2")).toBe(
      "https://tracker.example/settings/sites/site%3Aasura?url=https%3A%2F%2Fasuracomic.net%2Fseries%2Fx%2Fchapter%2F5%3Fa%3D1%26b%3D2",
    );
  });

  it("leaves the test URL out when there is none", () => {
    expect(ruleEditorUrl("https://tracker.example", "site:asura", null)).toBe("https://tracker.example/settings/sites/site%3Aasura");
  });
});
