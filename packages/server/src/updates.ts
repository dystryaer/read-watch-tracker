import { type Db, works } from "@rwt/db";
import { and, count, gt, inArray, isNotNull, max, sql } from "drizzle-orm";

/** The media types counted in chapters (`positionUnitFor` = "chapter"): the only ones a series page can be ahead of. */
const CHAPTER_TYPES = ["manga", "manhwa", "manhua", "light_novel"] as const;

/**
 * The number next to "Updates" in the navigation (SPEC §4.9): works whose series page shows whole
 * chapters beyond the one read, `floor(latest) − floor(chapter) > 0` as for the badge (§4.2), in
 * every status – exactly the works in the page's section "Neue Kapitel". One aggregate over
 * `works`, cheap enough for every page of the app.
 */
export async function countWorksWithNewChapters(db: Db): Promise<number> {
  const [row] = await db
    .select({ works: count() })
    .from(works)
    .where(
      and(
        inArray(works.type, CHAPTER_TYPES),
        isNotNull(works.chapter),
        isNotNull(works.latestChapter),
        gt(sql`floor(${works.latestChapter})`, sql`floor(${works.chapter})`),
      ),
    );
  return row?.works ?? 0;
}

/** When the extension last reported a series page (§7.11), so the page shows whether checks run at all. */
export async function lastSeriesCheck(db: Db): Promise<Date | null> {
  const [row] = await db.select({ at: max(works.latestChapterAt) }).from(works);
  return row?.at ?? null;
}
