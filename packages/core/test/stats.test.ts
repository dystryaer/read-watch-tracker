import { describe, expect, it } from "vitest";
import { bucketProgress, type ProgressStep, stepGain } from "../src/stats";

const chapterStep = (chapter: number, highest: number | null, day = "2026-10-21"): ProgressStep => ({
  day,
  chapter,
  season: null,
  episode: null,
  highest: highest === null ? null : { chapter: highest, season: null, episode: null },
});
const episodeStep = (season: number | null, episode: number, highest: { season: number | null; episode: number } | null): ProgressStep => ({
  day: "2026-10-21",
  chapter: null,
  season,
  episode,
  highest: highest === null ? null : { chapter: null, ...highest },
});

describe("stepGain (SPEC §4.8)", () => {
  it("counts the chapters a step moved beyond the highest one so far", () => {
    expect(stepGain(chapterStep(1204, 1200))).toEqual({ chapters: 4, episodes: 0 });
    expect(stepGain(chapterStep(13, 12))).toEqual({ chapters: 1, episodes: 0 });
  });

  it("counts a work's first event as one, not as its whole position", () => {
    expect(stepGain(chapterStep(1204, null))).toEqual({ chapters: 1, episodes: 0 });
  });

  it("counts nothing below or at the highest chapter: corrections, re-reads, a merged second history", () => {
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
    expect(stepGain(episodeStep(1, 1, null))).toEqual({ chapters: 0, episodes: 1 });
  });

  it("treats a side without a season as the same season", () => {
    expect(stepGain(episodeStep(null, 8, { season: 2, episode: 7 }))).toEqual({ chapters: 0, episodes: 1 });
    expect(stepGain(episodeStep(2, 9, { season: null, episode: 7 }))).toEqual({ chapters: 0, episodes: 2 });
  });

  it("counts nothing for a correction back to an earlier season", () => {
    expect(stepGain(episodeStep(1, 12, { season: 2, episode: 3 }))).toEqual({ chapters: 0, episodes: 0 });
  });

  it("counts one when the work had no position of the same kind before", () => {
    expect(stepGain({ ...chapterStep(12, null), highest: { chapter: null, season: null, episode: 3 } })).toEqual({ chapters: 1, episodes: 0 });
  });

  it("counts nothing for e-book percentages or a movie", () => {
    expect(stepGain({ day: "2026-10-21", chapter: null, season: null, episode: null, highest: null })).toEqual({ chapters: 0, episodes: 0 });
  });
});

describe("bucketProgress", () => {
  const NOW = new Date("2026-10-28T10:00:00Z"); // Wednesday

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

  it("takes the current week and month of the Berlin clock", () => {
    // Sunday 25 Oct, 23:30 UTC is already Monday in Berlin.
    expect(bucketProgress([], new Date("2026-10-25T23:30:00Z")).weeks[0]?.start).toBe("2026-10-26");
    // 30 Sep, 22:30 UTC is 1 Oct in Berlin.
    expect(bucketProgress([], new Date("2026-09-30T22:30:00Z")).months[0]?.month).toBe("2026-10");
  });

  it("sorts steps into weeks by their Berlin day, Sunday into the week before", () => {
    const steps = [chapterStep(13, 12, "2026-10-26"), chapterStep(15, 12, "2026-10-25"), chapterStep(20, 10, "2026-10-01")];

    const { weeks, months } = bucketProgress(steps, NOW);

    expect(weeks[0]).toEqual({ start: "2026-10-26", chapters: 1, episodes: 0 });
    expect(weeks[1]).toEqual({ start: "2026-10-19", chapters: 3, episodes: 0 });
    expect(weeks.find((week) => week.start === "2026-09-28")?.chapters).toBe(10);
    expect(months[0]).toEqual({ month: "2026-10", chapters: 14, episodes: 0 });
  });

  it("adds episodes and ignores steps outside the window or on malformed days", () => {
    const steps = [
      { ...episodeStep(1, 7, { season: 1, episode: 5 }), day: "2026-10-27" },
      chapterStep(50, 10, "2024-01-01"),
      chapterStep(60, 50, "2026-11-05"),
      chapterStep(70, 60, "not a day"),
    ];

    const { weeks, months } = bucketProgress(steps, NOW);

    expect(weeks[0]).toEqual({ start: "2026-10-26", chapters: 0, episodes: 2 });
    expect(months.reduce((sum, month) => sum + month.chapters, 0)).toBe(0);
  });

  it("counts a month boundary inside a week in both the week and its month", () => {
    const steps = [chapterStep(11, 10, "2026-07-31"), chapterStep(12, 11, "2026-08-01")];
    const { weeks, months } = bucketProgress(steps, new Date("2026-08-05T10:00:00Z"));

    expect(weeks[1]).toEqual({ start: "2026-07-27", chapters: 2, episodes: 0 });
    expect(months[0]?.chapters).toBe(1);
    expect(months[1]?.chapters).toBe(1);
  });

  it("starts the year's last week in December and its month in January", () => {
    const { weeks, months } = bucketProgress([chapterStep(2, 1, "2027-01-01")], new Date("2027-01-02T10:00:00Z"));
    expect(weeks[0]).toEqual({ start: "2026-12-28", chapters: 1, episodes: 0 });
    expect(months[0]).toEqual({ month: "2027-01", chapters: 1, episodes: 0 });
  });
});
