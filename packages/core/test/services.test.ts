import { describe, expect, it } from "vitest";
import { knownService, normalizeDomain } from "../src/services";

describe("knownService", () => {
  it("describes the streaming services and apps from the spec", () => {
    expect(knownService("crunchyroll")).toEqual({ name: "Crunchyroll", kind: "streaming", defaultMediaType: "anime" });
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
