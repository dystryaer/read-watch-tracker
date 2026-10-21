import { describe, expect, it } from "vitest";
import { isServiceHost, isServiceUrl, knownService, normalizeDomain, serviceKeyForUrl } from "../src/services";

describe("knownService", () => {
  it("describes the streaming services and apps from the spec", () => {
    expect(knownService("crunchyroll")).toMatchObject({ name: "Crunchyroll", kind: "streaming", defaultMediaType: "anime" });
    expect(knownService("primevideo")?.name).toBe("Prime Video");
    expect(knownService("netflix")?.kind).toBe("streaming");
    expect(knownService("disneyplus")?.name).toBe("Disney+");
    expect(knownService("webnovel")).toMatchObject({ kind: "app", defaultMediaType: "light_novel" });
    expect(knownService("kindle")).toMatchObject({ kind: "app", defaultMediaType: "ebook" });
  });

  it("returns undefined for other keys", () => {
    expect(knownService("site:asura")).toBeUndefined();
  });

  it.each([["constructor"], ["toString"], ["__proto__"], ["hasOwnProperty"]])(
    "does not resolve the prototype property %j",
    (key) => {
      expect(knownService(key)).toBeUndefined();
    },
  );
});

describe("normalizeDomain", () => {
  it("lowercases and drops a leading www.", () => {
    expect(normalizeDomain("WWW.AsuraComic.net")).toBe("asuracomic.net");
  });

  it("keeps other subdomains", () => {
    expect(normalizeDomain("read.amazon.com")).toBe("read.amazon.com");
  });

  it("drops a trailing dot", () => {
    expect(normalizeDomain("asuracomic.net.")).toBe("asuracomic.net");
  });
});

describe("isServiceUrl", () => {
  it.each([
    ["crunchyroll", "https://www.crunchyroll.com/watch/GXYZ/x"],
    ["crunchyroll", "https://static.crunchyroll.com/player.html"],
    ["primevideo", "https://www.amazon.de/gp/video/detail/B0ABC"],
    ["primevideo", "https://www.primevideo.com/detail/0ABC"],
    ["netflix", "https://www.netflix.com/watch/1"],
    ["disneyplus", "https://www.disneyplus.com/video/1"],
    ["kindle", "https://read.amazon.com/?asin=B08FHBV4ZX"],
    ["webnovel", "https://www.webnovel.com/book/123"],
  ])("accepts a %s URL on its own domain: %s", (key, url) => {
    expect(isServiceUrl(key, url)).toBe(true);
  });

  it.each([
    ["crunchyroll", "https://crunchyroll.com.evil.example/watch"],
    ["crunchyroll", "https://evilcrunchyroll.com/watch"],
    ["netflix", "https://www.crunchyroll.com/watch/1"],
    ["netflix", "javascript:alert(1)"],
    ["netflix", "http://www.netflix.com/watch/1"],
    ["netflix", "https://evil.netflix.com/watch/1"],
    ["primevideo", "https://www.amazon.de/dp/B0ABC"],
    ["primevideo", "https://smile.amazon.de/gp/video/detail/B0ABC"],
    ["site:asura", "https://asuracomic.net/x"],
  ])("refuses %s with %s", (key, url) => {
    expect(isServiceUrl(key, url)).toBe(false);
  });
});

describe("serviceKeyForUrl", () => {
  it("finds the service of a URL by https, exact host and the host's path prefix", () => {
    expect(serviceKeyForUrl("https://www.amazon.de/gp/video/detail/B0ABC")).toBe("primevideo");
    expect(serviceKeyForUrl("https://static.crunchyroll.com/vilos/player.html")).toBe("crunchyroll");
    expect(serviceKeyForUrl("https://www.amazon.de/dp/B0ABC")).toBeUndefined();
    expect(serviceKeyForUrl("https://asuracomic.net/x")).toBeUndefined();
  });
});

describe("isServiceHost", () => {
  it("knows the hosts that belong to a service and cannot become a website source", () => {
    expect(isServiceHost("www.netflix.com")).toBe(true);
    expect(isServiceHost("amazon.de")).toBe(true);
    expect(isServiceHost("read.amazon.com")).toBe(true);
    expect(isServiceHost("asuracomic.net")).toBe(false);
    expect(isServiceHost("netflix.com.evil.example")).toBe(false);
  });
});
