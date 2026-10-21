import { describe, expect, it } from "vitest";
import { DeviceConfig, EnableSourceRequest, PairingPollResponse, PairingStartRequest } from "../src/api";

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
