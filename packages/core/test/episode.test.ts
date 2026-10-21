import { describe, expect, it } from "vitest";
// Shared with the Shield's Kotlin module, so desktop and TV read labels the same way.
import fixtures from "../fixtures/episodes.json" with { type: "json" };
import { parseEpisode, streamingSeriesKey } from "../src/episode";

describe("parseEpisode", () => {
  it.each(fixtures.parse.map((entry) => [entry.label, entry]))("reads %j", (label, { season, episode }) => {
    expect(parseEpisode(label)).toEqual({ season, episode });
  });

  it.each(fixtures.reject.map((label) => [label]))("finds no episode in %j", (label) => {
    expect(parseEpisode(label)).toBeNull();
  });

  it("caps the label length before any pattern runs", () => {
    expect(parseEpisode(`${"x".repeat(5000)} S1 E5`)).toBeNull();
  });
});

describe("streamingSeriesKey", () => {
  it.each(fixtures.streamingKey.map((entry) => [entry.title, entry.key]))("turns %j into %j", (title, key) => {
    expect(streamingSeriesKey(title)).toBe(key);
  });

  it("stays within the text limit even when Unicode normalization expands the title", () => {
    // U+FDFA becomes 18 characters under NFKC.
    const expanding = String.fromCharCode(0xfdfa).repeat(300);
    expect(streamingSeriesKey(expanding).length).toBeLessThanOrEqual(300);
  });

  it("never returns an empty key: a title of punctuation only keeps its text", () => {
    expect(streamingSeriesKey("  !!!  ")).toBe("!!!");
  });

  it("is idempotent", () => {
    for (const { title } of fixtures.streamingKey) {
      expect(streamingSeriesKey(streamingSeriesKey(title))).toBe(streamingSeriesKey(title));
    }
  });
});
