import { describe, expect, it } from "vitest";
import { coverSrc, coverTile, TILE_TONES } from "../src/lib/cover";

describe("coverSrc", () => {
  it("is null without a picture and a versioned URL with one", () => {
    expect(coverSrc("abc", null)).toBeNull();
    expect(coverSrc("abc", 42)).toBe("/works/abc/cover?v=42");
  });
});

describe("coverTile", () => {
  it.each([
    ["Solo Leveling", "SL"],
    ["Overgeared", "O"],
    ["The Beginning After the End", "TB"],
    ["„Ω-Ranker’s Return“", "ΩR"],
    ["86", "8"],
    ["!!!", "?"],
  ])("uses up to two initials for %s", (title, initials) => {
    expect(coverTile(title).initials).toBe(initials);
  });

  it("gives a title the same color every time, and different titles different ones", () => {
    expect(coverTile("Solo Leveling").tone).toBe(coverTile("Solo Leveling").tone);
    const tones = new Set(["Solo Leveling", "Overgeared", "Eleceed", "Lookism", "Nano Machine", "Omniscient Reader"].map((title) => coverTile(title).tone));
    expect(tones.size).toBeGreaterThan(2);
    for (const tone of tones) expect(tone).toBeLessThan(TILE_TONES);
  });
});
