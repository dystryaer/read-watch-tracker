import { describe, expect, it } from "vitest";
import { DeviceConfig, EnableSourceRequest, PairingPollResponse, PairingStartRequest, ShareConfirmRequest, ShareRequest } from "../src/api";

describe("PairingStartRequest", () => {
  it("accepts an extension or shield with a name", () => {
    expect(PairingStartRequest.safeParse({ kind: "shield", name: "Shield Wohnzimmer" }).success).toBe(true);
  });

  it("refuses phones, which get their token in the web app", () => {
    expect(PairingStartRequest.safeParse({ kind: "phone", name: "iPhone" }).success).toBe(false);
  });

  it("cleans and caps the device name", () => {
    expect(PairingStartRequest.parse({ kind: "extension", name: " Brave\n Desktop " }).name).toBe("Brave Desktop");
    expect(PairingStartRequest.safeParse({ kind: "extension", name: "x".repeat(101) }).success).toBe(false);
  });
});

describe("PairingPollResponse", () => {
  it("accepts a well-formed token", () => {
    expect(PairingPollResponse.safeParse({ status: "approved", deviceToken: "A".repeat(43) }).success).toBe(true);
  });

  it("rejects a malformed token", () => {
    expect(PairingPollResponse.safeParse({ status: "approved", deviceToken: "<script>" }).success).toBe(false);
  });
});

describe("EnableSourceRequest", () => {
  it("accepts an origin with or without trailing slash", () => {
    expect(EnableSourceRequest.parse({ origin: "https://asuracomic.net" }).origin).toBe("https://asuracomic.net/");
    expect(EnableSourceRequest.safeParse({ origin: "https://asuracomic.net/" }).success).toBe(true);
  });

  it.each([["https://asuracomic.net/series/x"], ["javascript:alert(1)"], ["https://asuracomic.net/?q=1"], ["asuracomic.net"]])(
    "rejects %j as origin",
    (origin) => {
      expect(EnableSourceRequest.safeParse({ origin }).success).toBe(false);
    },
  );

  it("accepts a move from an existing source", () => {
    expect(
      EnableSourceRequest.safeParse({ origin: "https://asurascans.com", moveFromSourceKey: "site:asuracomic-net" }).success,
    ).toBe(true);
  });
});

describe("DeviceConfig", () => {
  it("validates the site rules it carries", () => {
    const config = {
      sites: [{ sourceKey: "site:x", domains: ["x.example"], chapterPattern: "(unclosed" }],
      thresholds: { scrollDepthPercent: 60, watchedPercent: 85 },
    };
    expect(DeviceConfig.safeParse(config).success).toBe(false);
  });

  it("rejects thresholds outside the sane range", () => {
    expect(DeviceConfig.safeParse({ sites: [], thresholds: { scrollDepthPercent: 0, watchedPercent: 85 } }).success).toBe(false);
  });
});

describe("ShareRequest", () => {
  it("takes what the share sheet hands over: a URL, a text or both", () => {
    expect(ShareRequest.safeParse({ url: "https://m.webnovel.com/book/22196546206090805" }).success).toBe(true);
    expect(ShareRequest.safeParse({ text: "Shadow Slave https://m.webnovel.com/book/22196546206090805" }).success).toBe(true);
  });

  it.each([[{}], [{ url: "" }], [{ url: "x".repeat(2049) }], [{ text: "x".repeat(2001) }], [{ url: 42 }]])("refuses %j", (body) => {
    expect(ShareRequest.safeParse(body).success).toBe(false);
  });
});

describe("ShareConfirmRequest", () => {
  const shareId = "6f1c0a52-8d4b-4a8e-9a7c-2f6b5d1e0c11";

  it("takes exactly one of chapter and percent", () => {
    expect(ShareConfirmRequest.parse({ shareId, chapter: 1205 })).toEqual({ shareId, chapter: 1205 });
    expect(ShareConfirmRequest.parse({ shareId, percent: 43.5 })).toEqual({ shareId, percent: 43.5 });
  });

  it("accepts numbers typed with a decimal comma, as a German keyboard sends them", () => {
    expect(ShareConfirmRequest.parse({ shareId, percent: "43,5" })).toEqual({ shareId, percent: 43.5 });
  });

  it.each([
    [{ shareId }],
    [{ shareId, chapter: 1, percent: 1 }],
    [{ shareId, chapter: -1 }],
    [{ shareId, chapter: 100000 }],
    [{ shareId, percent: 101 }],
    [{ shareId, chapter: "zwölf" }],
    [{ shareId: "x", chapter: 1 }],
  ])("refuses %j", (body) => {
    expect(ShareConfirmRequest.safeParse(body).success).toBe(false);
  });
});
