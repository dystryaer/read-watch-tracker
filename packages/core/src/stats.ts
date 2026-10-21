/** Weeks and months of the statistics page (SPEC §4.8) are those of the owner's clock. */
export const STATS_TIME_ZONE = "Europe/Berlin";
const WEEKS = 12;
const MONTHS = 12;
const DAY_MS = 86_400_000;

interface StepPosition {
  chapter: number | null;
  season: number | null;
  episode: number | null;
}

/** An applied event with the position of the previous applied event of the same work. */
export interface ProgressStep extends StepPosition {
  occurredAt: Date;
  previous: StepPosition | null;
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
 * What one step adds (SPEC §4.8): the whole chapters or episodes it moved forward. A work's first
 * event counts one – an imported position is not reading – and corrections backwards count nothing.
 */
export function stepGain(step: ProgressStep): ProgressGain {
  const previous = step.previous;
  if (step.chapter !== null) {
    const chapters = previous?.chapter == null ? 1 : Math.max(0, Math.floor(step.chapter) - Math.floor(previous.chapter));
    return { chapters, episodes: 0 };
  }
  if (step.episode !== null) {
    const sameSeason = previous !== null && (step.season === null || previous.season === null || step.season === previous.season);
    const episodes = previous?.episode == null || !sameSeason ? 1 : Math.max(0, step.episode - previous.episode);
    return { chapters: 0, episodes };
  }
  return { chapters: 0, episodes: 0 };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day in the time zone, as a UTC midnight timestamp (for day arithmetic) plus weekday. */
function localDay(date: Date, timeZone: string): { day: number; weekday: number } {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday ?? "");
  return { day, weekday };
}

const isoDay = (day: number) => new Date(day).toISOString().slice(0, 10);
const weekStart = (date: Date, timeZone: string) => {
  const { day, weekday } = localDay(date, timeZone);
  return isoDay(day - weekday * DAY_MS);
};
const monthOf = (date: Date, timeZone: string) => isoDay(localDay(date, timeZone).day).slice(0, 7);

/** Chapters and episodes per week (Monday to Sunday) and per month, the newest first (SPEC §4.8). */
export function bucketProgress(
  steps: readonly ProgressStep[],
  now: Date,
  timeZone = STATS_TIME_ZONE,
): { weeks: WeekBucket[]; months: MonthBucket[] } {
  const currentWeek = Date.parse(`${weekStart(now, timeZone)}T00:00:00Z`);
  const weeks = Array.from({ length: WEEKS }, (_, index) => ({ start: isoDay(currentWeek - index * 7 * DAY_MS), chapters: 0, episodes: 0 }));

  const [year, month] = monthOf(now, timeZone).split("-").map(Number) as [number, number];
  const months = Array.from({ length: MONTHS }, (_, index) => ({
    month: isoDay(Date.UTC(year, month - 1 - index, 1)).slice(0, 7),
    chapters: 0,
    episodes: 0,
  }));

  const weekByStart = new Map(weeks.map((week) => [week.start, week]));
  const monthByKey = new Map(months.map((bucket) => [bucket.month, bucket]));
  for (const step of steps) {
    const gain = stepGain(step);
    if (gain.chapters === 0 && gain.episodes === 0) continue;
    for (const bucket of [weekByStart.get(weekStart(step.occurredAt, timeZone)), monthByKey.get(monthOf(step.occurredAt, timeZone))]) {
      if (!bucket) continue;
      bucket.chapters += gain.chapters;
      bucket.episodes += gain.episodes;
    }
  }
  return { weeks, months };
}
