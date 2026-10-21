import { describe, expect, it } from "vitest";
import { eventKindLabel, eventOutcomeLabel, formatDateTime, positionText } from "../src/lib/format";

describe("positionText", () => {
  it.each([
    [{ chapter: 216, season: null, episode: null, percent: null }, "Kap. 216"],
    [{ chapter: null, season: 1, episode: 14, percent: null }, "S1 · F14"],
    [{ chapter: null, season: null, episode: 3, percent: null }, "F3"],
    [{ chapter: null, season: null, episode: null, percent: 43.5 }, "43,5 %"],
    [{ chapter: null, season: null, episode: null, percent: null }, "–"],
  ])("formats %j", (columns, text) => {
    expect(positionText(columns)).toBe(text);
  });
});

describe("labels", () => {
  it("names event kinds in German", () => {
    expect(eventKindLabel("read")).toBe("Gelesen");
    expect(eventKindLabel("watched")).toBe("Gesehen");
    expect(eventKindLabel("library_sync")).toBe("Bibliothek");
    expect(eventKindLabel("backfill")).toBe("Verlauf");
    expect(eventKindLabel("manual")).toBe("Manuell");
  });

  it("names outcomes in German", () => {
    expect(eventOutcomeLabel("applied")).toBe("übernommen");
    expect(eventOutcomeLabel("no_change")).toBe("keine Änderung");
    expect(eventOutcomeLabel("pending")).toBe("wartet auf Zuordnung");
    expect(eventOutcomeLabel("ignored")).toBe("ignoriert");
    expect(eventOutcomeLabel("rejected")).toBe("abgelehnt");
  });
});

describe("formatDateTime", () => {
  it("formats in the German time zone regardless of the server's zone", () => {
    expect(formatDateTime(new Date("2026-10-21T18:30:00Z"))).toBe("21.10.2026, 20:30");
    expect(formatDateTime(new Date("2026-12-21T18:30:00Z"))).toBe("21.12.2026, 19:30");
  });
});
