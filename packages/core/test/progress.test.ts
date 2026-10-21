import { describe, expect, it } from "vitest";
import type { Position } from "../src/event";
import {
  comparePositions,
  fitsMediaType,
  PositionUnitMismatchError,
  positionUnitFor,
  shouldAdvance,
} from "../src/progress";

const chapter = (value: number): Position => ({ unit: "chapter", chapter: value });
const episode = (season: number | null, value: number): Position => ({
  unit: "episode",
  season,
  episode: value,
});
const percent = (value: number): Position => ({ unit: "percent", percent: value });
const none: Position = { unit: "none" };

describe("positionUnitFor", () => {
  it.each([
    ["manga", "chapter"],
    ["manhwa", "chapter"],
    ["manhua", "chapter"],
    ["light_novel", "chapter"],
    ["anime", "episode"],
    ["series", "episode"],
    ["ebook", "percent"],
    ["movie", "none"],
  ] as const)("maps %s to %s", (mediaType, unit) => {
    expect(positionUnitFor(mediaType)).toBe(unit);
  });
});

describe("fitsMediaType", () => {
  it("accepts a chapter for a manhwa", () => {
    expect(fitsMediaType("manhwa", chapter(3))).toBe(true);
  });

  it("rejects a chapter for an anime", () => {
    expect(fitsMediaType("anime", chapter(3))).toBe(false);
  });

  it("rejects a percentage for a manga", () => {
    expect(fitsMediaType("manga", percent(40))).toBe(false);
  });
});

describe("comparePositions", () => {
  it("orders chapters numerically, including decimals", () => {
    expect(comparePositions(chapter(105.5), chapter(105))).toBeGreaterThan(0);
    expect(comparePositions(chapter(9), chapter(10))).toBeLessThan(0);
    expect(comparePositions(chapter(42), chapter(42))).toBe(0);
  });

  it("orders percentages numerically", () => {
    expect(comparePositions(percent(43.5), percent(43))).toBeGreaterThan(0);
  });

  it("orders episodes by season first", () => {
    expect(comparePositions(episode(2, 1), episode(1, 24))).toBeGreaterThan(0);
  });

  it("orders episodes within a season", () => {
    expect(comparePositions(episode(1, 14), episode(1, 13))).toBeGreaterThan(0);
  });

  it("compares only episodes when the incoming season is missing", () => {
    expect(comparePositions(episode(null, 15), episode(2, 14))).toBeGreaterThan(0);
    expect(comparePositions(episode(null, 3), episode(2, 14))).toBeLessThan(0);
  });

  it("compares only episodes when the stored season is missing", () => {
    expect(comparePositions(episode(2, 3), episode(null, 10))).toBeLessThan(0);
  });

  it("treats two 'none' positions as equal", () => {
    expect(comparePositions(none, none)).toBe(0);
  });

  it("throws on different units", () => {
    expect(() => comparePositions(chapter(1), percent(1))).toThrow(PositionUnitMismatchError);
  });
});

describe("shouldAdvance", () => {
  it("takes any position when the current one is unknown", () => {
    expect(shouldAdvance(null, chapter(0))).toBe(true);
    expect(shouldAdvance(null, none)).toBe(true);
  });

  it("advances to a higher chapter", () => {
    expect(shouldAdvance(chapter(216), chapter(217))).toBe(true);
  });

  it("does not move back when an older chapter is re-read", () => {
    expect(shouldAdvance(chapter(150), chapter(100))).toBe(false);
  });

  it("does not report a change for the same chapter", () => {
    expect(shouldAdvance(chapter(150), chapter(150))).toBe(false);
  });

  it("advances to the next season", () => {
    expect(shouldAdvance(episode(1, 24), episode(2, 1))).toBe(true);
  });

  it("does not advance for a repeated 'none' position", () => {
    expect(shouldAdvance(none, none)).toBe(false);
  });

  it("throws when the incoming unit does not match the stored one", () => {
    expect(() => shouldAdvance(chapter(1), episode(1, 1))).toThrow(PositionUnitMismatchError);
  });
});
