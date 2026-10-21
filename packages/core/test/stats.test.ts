import { describe, expect, it } from "vitest";
import { bucketProgress, type ProgressStep, stepGain } from "../src/stats";

const at = (iso: string) => new Date(iso);
const chapterStep = (chapter: number, previous: number | null, occurredAt = "2026-10-21T12:00:00Z"): ProgressStep => ({
  occurredAt: at(occurredAt),
  chapter,
  season: null,
  episode: null,
  previous: previous === null ? null : { chapter: previous, season: null, episode: null },
});
const episodeStep = (season: number | null, episode: number, previous: { season: number | null; episode: number } | null): ProgressStep => ({
  occurredAt: at("2026-10-21T12:00:00Z"),
  chapter: null,
  season,
  episode,
  previous: previous === null ? null : { chapter: null, ...previous },
});

describe("stepGain (SPEC §4.8)", () => {
  it("counts the chapters a step moved forward", () => {
    expect(stepGain(chapterStep(1204, 1200))).toEqual({ chapters: 4, episodes: 0 });
    expect(stepGain(chapterStep(13, 12))).toEqual({ chapters: 1, episodes: 0 });
  });

  it("counts a work's first event as one, not as its whole position", () => {
    expect(stepGain(chapterStep(1204, null))).toEqual({ chapters: 1, episodes: 0 });
  });

  it("counts nothing for a correction backwards or a repeat", () => {
    expect(stepGain(chapterStep(1200, 1210))).toEqual({ chapters: 0, episodes: 0 });
    expect(stepGain(chapterStep(1210, 1210))).toEqual({ chapters: 0, episodes: 0 });
  });

  it("counts whole chapters: an extra chapter 105.5 is part of 105", () => {
    expect(stepGain(chapterStep(105.5, 105))).toEqual({ chapters: 0, episodes: 0 });
    expect(stepGain(chapterStep(106, 105.5))).toEqual({ chapters: 1, episodes: 0 });
  });

  it("counts episodes within a season and one for a new season", () => {
    expect(stepGain(episodeStep(1, 7, { season: 1, episode: 5 }))).toEqual({ chapters: 0, episodes: 2 });
    expect(stepGain(episodeStep(2, 1, { season: 1, episode: 12 }))).toEqual({ chapters: 0, episodes: 1 });
    expect(stepGain(episodeStep(null, 8, { season: 2, episode: 7 }))).toEqual({ chapters: 0, episodes: 1 });
    expect(stepGain(episodeStep(1, 1, null))).toEqual({ chapters: 0, episodes: 1 });
  });

  it("counts one when the previous event had no position of the same kind", () => {
    expect(stepGain({ ...chapterStep(12, null), previous: { chapter: null, season: null, episode: 3 } })).toEqual({ chapters: 1, episodes: 0 });
  });

  it("counts nothing for e-book percentages or a movie", () => {
    expect(stepGain({ occurredAt: at("2026-10-21T12:00:00Z"), chapter: null, season: null, episode: null, previous: null })).toEqual({
      chapters: 0,
      episodes: 0,
    });
  });
});

describe("bucketProgress", () => {
  const NOW = at("2026-10-28T10:00:00Z"); // Wednesday

  it("returns the last 12 weeks (Monday to Sunday) and 12 months, newest first, also when empty", () => {
    const { weeks, months } = bucketProgress([], NOW);

    expect(weeks).toHaveLength(12);
    expect(weeks[0]).toEqual({ start: "2026-10-26", chapters: 0, episodes: 0 });
    expect(weeks[1]?.start).toBe("2026-10-19");
    expect(weeks[11]?.start).toBe("2026-08-10");
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: "2026-10", chapters: 0, episodes: 0 });
    expect(months[11]?.month).toBe("2025-11");
  });

  it("sorts events into Berlin weeks and months, across the change from summer time", () => {
    const steps = [
      // Sunday 25 Oct, 23:30 UTC is Monday 00:30 in Berlin (winter time from that night on).
      chapterStep(13, 12, "2026-10-25T23:30:00Z"),
      // Sunday 25 Oct, 21:00 UTC is still Sunday in Berlin.
      chapterStep(15, 12, "2026-10-25T21:00:00Z"),
      // 30 Sep, 22:30 UTC is 1 Oct, 00:30 in Berlin (summer time).
      chapterStep(20, 10, "2026-09-30T22:30:00Z"),
    ];

    const { weeks, months } = bucketProgress(steps, NOW);

    expect(weeks[0]).toEqual({ start: "2026-10-26", chapters: 1, episodes: 0 });
    expect(weeks[1]).toEqual({ start: "2026-10-19", chapters: 3, episodes: 0 });
    expect(weeks.find((week) => week.start === "2026-09-28")?.chapters).toBe(10);
    expect(months[0]).toEqual({ month: "2026-10", chapters: 14, episodes: 0 });
    expect(months[1]).toEqual({ month: "2026-09", chapters: 0, episodes: 0 });
  });

  it("adds episodes and ignores events outside the window", () => {
    const steps = [
      { ...episodeStep(1, 7, { season: 1, episode: 5 }), occurredAt: at("2026-10-27T20:00:00Z") },
      chapterStep(50, 10, "2024-01-01T12:00:00Z"),
      chapterStep(60, 50, "2026-11-05T12:00:00Z"),
    ];

    const { weeks, months } = bucketProgress(steps, NOW);

    expect(weeks[0]).toEqual({ start: "2026-10-26", chapters: 0, episodes: 2 });
    expect(months.reduce((sum, month) => sum + month.chapters, 0)).toBe(0);
  });

  it("counts a month boundary inside a week in both the week and its month", () => {
    const steps = [chapterStep(11, 10, "2026-07-31T10:00:00Z"), chapterStep(12, 11, "2026-08-01T10:00:00Z")];
    const { weeks, months } = bucketProgress(steps, at("2026-08-05T10:00:00Z"));

    expect(weeks[1]).toEqual({ start: "2026-07-27", chapters: 2, episodes: 0 });
    expect(months[0]?.chapters).toBe(1);
    expect(months[1]?.chapters).toBe(1);
  });
});
