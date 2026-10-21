/** Weeks and months of the statistics page (SPEC §4.8) are those of the owner's clock. */
export const STATS_TIME_ZONE = "Europe/Berlin";
const WEEKS = 12;
const MONTHS = 12;
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

interface StepPosition {
  chapter: number | null;
  season: number | null;
  episode: number | null;
}

/** An applied event with the highest position its work had reached before it. */
export interface ProgressStep extends StepPosition {
  /** Calendar day of the event on the Berlin clock, "2026-10-26". */
  day: string;
  highest: StepPosition | null;
}

export interface ProgressGain {
  chapters: number;
  episodes: number;
}

export interface WeekBucket extends ProgressGain {
  /** Monday of the week, "2026-10-26". */
  start: string;
}

export interface MonthBucket extends ProgressGain {
  /** "2026-10". */
  month: string;
}

/**
 * What one step adds (SPEC §4.8): the whole chapters or episodes it moved beyond the highest
 * position reached so far. A work's first event counts one – an imported position is not reading;
 * corrections, re-reads and the second history of a merged duplicate count nothing.
 */
export function stepGain(step: ProgressStep): ProgressGain {
  const highest = step.highest;
  if (step.chapter !== null) {
    const chapters = highest?.chapter == null ? 1 : Math.max(0, Math.floor(step.chapter) - Math.floor(highest.chapter));
    return { chapters, episodes: 0 };
  }
  if (step.episode !== null) {
    if (highest?.episode == null) return { chapters: 0, episodes: 1 };
    // A side without a season (the Shield) is taken to be in the other side's season.
    if (step.season !== null && highest.season !== null && step.season !== highest.season) {
      return { chapters: 0, episodes: step.season > highest.season ? 1 : 0 };
    }
    return { chapters: 0, episodes: Math.max(0, step.episode - highest.episode) };
  }
  return { chapters: 0, episodes: 0 };
}

/** Today on the Berlin clock: computed once per call, the steps bring their own day. */
function localDay(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Monday of the day's week, or null for a malformed day. */
function weekStart(day: string): string | null {
  if (!ISO_DAY.test(day)) return null;
  const time = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  const sinceMonday = (new Date(time).getUTCDay() + 6) % 7;
  return isoDay(time - sinceMonday * DAY_MS);
}

/** Chapters and episodes per week (Monday to Sunday) and per month, the newest first (SPEC §4.8). */
export function bucketProgress(
  steps: readonly ProgressStep[],
  now: Date,
  timeZone = STATS_TIME_ZONE,
): { weeks: WeekBucket[]; months: MonthBucket[] } {
  const today = localDay(now, timeZone);
  const currentWeek = Date.parse(`${weekStart(today) ?? today}T00:00:00Z`);
  const weeks = Array.from({ length: WEEKS }, (_, index) => ({ start: isoDay(currentWeek - index * 7 * DAY_MS), chapters: 0, episodes: 0 }));

  const [year, month] = today.split("-").map(Number) as [number, number];
  const months = Array.from({ length: MONTHS }, (_, index) => ({
    month: isoDay(Date.UTC(year, month - 1 - index, 1)).slice(0, 7),
    chapters: 0,
    episodes: 0,
  }));

  const weekByStart = new Map(weeks.map((week) => [week.start, week]));
  const monthByKey = new Map(months.map((bucket) => [bucket.month, bucket]));
  for (const step of steps) {
    const week = weekStart(step.day);
    if (week === null) continue;
    const gain = stepGain(step);
    if (gain.chapters === 0 && gain.episodes === 0) continue;
    for (const bucket of [weekByStart.get(week), monthByKey.get(step.day.slice(0, 7))]) {
      if (!bucket) continue;
      bucket.chapters += gain.chapters;
      bucket.episodes += gain.episodes;
    }
  }
  return { weeks, months };
}
