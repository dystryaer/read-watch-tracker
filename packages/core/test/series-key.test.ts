import { describe, expect, it } from "vitest";
import { normalizeSeriesKey } from "../src/series-key";

describe("normalizeSeriesKey", () => {
  it("keeps a plain slug", () => {
    expect(normalizeSeriesKey("solo-leveling")).toBe("solo-leveling");
  });

  it("lowercases and unifies separators", () => {
    expect(normalizeSeriesKey("Solo_Leveling")).toBe("solo-leveling");
    expect(normalizeSeriesKey("Solo Leveling")).toBe("solo-leveling");
    expect(normalizeSeriesKey("solo--leveling")).toBe("solo-leveling");
  });

  it("trims leading and trailing separators", () => {
    expect(normalizeSeriesKey("-solo-leveling-")).toBe("solo-leveling");
  });

  it.each([
    ["overgeared-7d3f2a1b"],
    ["overgeared-a1b2c3"],
    ["overgeared-0f9e8d7c6b5a4f3e"],
  ])("strips the random hash suffix of %j", (slug) => {
    expect(normalizeSeriesKey(slug)).toBe("overgeared");
  });

  it("keeps a purely numeric suffix, which is usually a stable id", () => {
    expect(normalizeSeriesKey("overgeared-1234567")).toBe("overgeared-1234567");
  });

  it("keeps a suffix made only of hex letters, which is usually a word", () => {
    expect(normalizeSeriesKey("the-silent-facade")).toBe("the-silent-facade");
  });

  it("keeps short alphanumeric suffixes", () => {
    expect(normalizeSeriesKey("solo-leveling-s2")).toBe("solo-leveling-s2");
  });

  it("does not strip a hash that is the whole slug", () => {
    expect(normalizeSeriesKey("7d3f2a1b")).toBe("7d3f2a1b");
  });

  it("decodes percent-encoded slugs and keeps non-Latin letters", () => {
    expect(normalizeSeriesKey("%EB%82%98-%ED%98%BC%EC%9E%90%EB%A7%8C")).toBe("나-혼자만");
  });

  it("tolerates malformed percent-encoding", () => {
    expect(normalizeSeriesKey("solo%E0%A4%A-leveling")).toBe("solo-e0-a4-a-leveling");
  });

  it("folds apostrophes and diacritics like titles do", () => {
    expect(normalizeSeriesKey("swordmaster’s-youngest-son")).toBe("swordmasters-youngest-son");
    expect(normalizeSeriesKey("tōkyō-ghoul")).toBe("tokyo-ghoul");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(normalizeSeriesKey("---")).toBe("");
    expect(normalizeSeriesKey("")).toBe("");
  });

  it("caps the key at 300 characters", () => {
    expect(normalizeSeriesKey("a".repeat(400))).toHaveLength(300);
  });
});
