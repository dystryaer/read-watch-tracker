import { bucketProgress, type MonthBucket, type ProgressStep, type WeekBucket } from "@rwt/core";
import { type Db, events } from "@rwt/db";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

// Thirteen months back covers the oldest month bucket in any time zone.
const WINDOW_MS = 400 * 86_400_000;

const toNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/**
 * The statistics page (SPEC §4.8): chapters and episodes per week and month, measured as progress
 * between consecutive applied events of each work. Events before the window still serve as the
 * base of the first step inside it.
 */
export async function progressStats(db: Db, now = new Date()): Promise<{ weeks: WeekBucket[]; months: MonthBucket[] }> {
  const previous = sql`over (partition by ${events.workId} order by ${events.occurredAt}, ${events.receivedAt}, ${events.id})`;
  const steps = db
    .select({
      occurredAt: events.occurredAt,
      chapter: events.chapter,
      season: events.season,
      episode: events.episode,
      previousChapter: sql<unknown>`lag(${events.chapter}) ${previous}`.as("previous_chapter"),
      previousSeason: sql<unknown>`lag(${events.season}) ${previous}`.as("previous_season"),
      previousEpisode: sql<unknown>`lag(${events.episode}) ${previous}`.as("previous_episode"),
      hasPrevious: sql<boolean>`lag(${events.id}) ${previous} is not null`.as("has_previous"),
    })
    .from(events)
    .where(and(eq(events.outcome, "applied"), isNotNull(events.workId)))
    .as("steps");

  const rows = await db
    .select()
    .from(steps)
    .where(gte(steps.occurredAt, new Date(now.getTime() - WINDOW_MS)));

  const progress: ProgressStep[] = rows.map((row) => ({
    occurredAt: row.occurredAt,
    chapter: toNumber(row.chapter),
    season: toNumber(row.season),
    episode: toNumber(row.episode),
    previous: row.hasPrevious
      ? { chapter: toNumber(row.previousChapter), season: toNumber(row.previousSeason), episode: toNumber(row.previousEpisode) }
      : null,
  }));
  return bucketProgress(progress, now);
}
