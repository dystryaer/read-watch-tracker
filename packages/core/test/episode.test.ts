import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEpisode, streamingSeriesKey } from "../src/episode";

interface Fixtures {
  parse: { label: string; season: number | null; episode: number }[];
  reject: string[];
  streamingKey: { title: string; key: string }[];
}

// Shared with the Shield's Kotlin module, so desktop and TV read labels the same way.
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/episodes.json", import.meta.url), "utf8")) as Fixtures;

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

  it("is idempotent", () => {
    for (const { title } of fixtures.streamingKey) {
      expect(streamingSeriesKey(streamingSeriesKey(title))).toBe(streamingSeriesKey(title));
    }
  });
});
