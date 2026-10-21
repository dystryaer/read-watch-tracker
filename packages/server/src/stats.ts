import { bucketProgress, type MonthBucket, type ProgressStep, STATS_TIME_ZONE, type WeekBucket } from "@rwt/core";
import { type Db, events } from "@rwt/db";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

// Thirteen months back covers the oldest month bucket in any time zone.
const WINDOW_MS = 400 * 86_400_000;
// (season, episode) as one sortable number, so the highest episode so far is a plain max().
const SEASON_FACTOR = 100_000;

// Raw window values; a tampered numeric 'NaN' must not end up in the counts.
const toNumber = (value: unknown): number | null => {
  const number = value === null || value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * The statistics page (SPEC §4.8): chapters and episodes per week and month, each applied event
 * measured against the highest position its work had reached before. Events before the window
 * still count towards that highest position. The database supplies the Berlin calendar day.
 */
export async function progressStats(db: Db, now = new Date()): Promise<{ weeks: WeekBucket[]; months: MonthBucket[] }> {
  const inOrder = sql`partition by ${events.workId} order by ${events.occurredAt}, ${events.receivedAt}, ${events.id}`;
  const before = sql`over (${inOrder} rows between unbounded preceding and 1 preceding)`;
  const episodeKey = sql`coalesce(${events.season}, 0) * ${SEASON_FACTOR} + ${events.episode}`;
  const steps = db
    .select({
      occurredAt: events.occurredAt,
      day: sql<string>`((${events.occurredAt} at time zone ${STATS_TIME_ZONE})::date)::text`.as("day"),
      chapter: events.chapter,
      season: events.season,
      episode: events.episode,
      highestChapter: sql<unknown>`max(${events.chapter}) ${before}`.as("highest_chapter"),
      highestEpisodeKey: sql<unknown>`max(${episodeKey}) ${before}`.as("highest_episode_key"),
      hasPrevious: sql<boolean>`count(*) ${before} > 0`.as("has_previous"),
    })
    .from(events)
    .where(and(eq(events.outcome, "applied"), isNotNull(events.workId)))
    .as("steps");

  const rows = await db
    .select()
    .from(steps)
    .where(gte(steps.occurredAt, new Date(now.getTime() - WINDOW_MS)));

  const progress: ProgressStep[] = rows.map((row) => {
    const key = toNumber(row.highestEpisodeKey);
    const season = key === null ? null : Math.floor(key / SEASON_FACTOR);
    return {
      day: row.day,
      chapter: toNumber(row.chapter),
      season: toNumber(row.season),
      episode: toNumber(row.episode),
      highest: row.hasPrevious
        ? {
            chapter: toNumber(row.highestChapter),
            season: season === 0 ? null : season,
            episode: key === null ? null : key % SEASON_FACTOR,
          }
        : null,
    };
  });
  return bucketProgress(progress, now);
}
