import { type Db, workCovers, workLinks, works } from "@rwt/db";
import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { type DownloadResult, downloadImage, MAX_COVER_BYTES, sniffImageType } from "./http/image-download";
import { WorkNotFoundError } from "./manual";

// A site picture that failed is tried again after a week (the site may have fixed it).
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export class CoverImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoverImageError";
  }
}

export interface CoverImage {
  mime: string;
  image: Uint8Array;
  updatedAt: Date;
}

/** The stored picture of a work, or null when it has none (tile instead). */
export async function getCoverImage(db: Db, workId: string): Promise<CoverImage | null> {
  const [row] = await db
    .select({ mime: workCovers.mime, image: workCovers.image, updatedAt: workCovers.updatedAt })
    .from(workCovers)
    .where(and(eq(workCovers.workId, workId), inArray(workCovers.kind, ["site", "upload"])));
  return row?.mime && row.image ? { mime: row.mime, image: row.image, updatedAt: row.updatedAt } : null;
}

/**
 * A picture chosen by hand (file, clipboard or address). It is checked by its bytes and replaces
 * whatever the work had; site pictures never overwrite it.
 */
export async function setCoverImage(
  db: Db,
  workId: string,
  bytes: Uint8Array,
  { sourceUrl = null, now = new Date() }: { sourceUrl?: string | null; now?: Date } = {},
): Promise<void> {
  if (bytes.byteLength > MAX_COVER_BYTES) throw new CoverImageError("too_large");
  const mime = sniffImageType(bytes);
  if (!mime) throw new CoverImageError("not_image");
  await requireWork(db, workId);
  const values = { kind: "upload" as const, mime, image: bytes, sourceUrl, updatedAt: now };
  await db.insert(workCovers).values({ workId, ...values }).onConflictDoUpdate({ target: workCovers.workId, set: values });
}

/** No picture, and none from the site either: the work shows its tile. */
export async function removeCover(db: Db, workId: string, now = new Date()): Promise<void> {
  await requireWork(db, workId);
  const values = { kind: "removed" as const, mime: null, image: null, sourceUrl: null, updatedAt: now };
  await db.insert(workCovers).values({ workId, ...values }).onConflictDoUpdate({ target: workCovers.workId, set: values });
}

/** Forgets the work's picture, so the site's picture can come (again) with fillSiteCovers. */
export async function resetCover(db: Db, workId: string): Promise<void> {
  await db.delete(workCovers).where(eq(workCovers.workId, workId));
}

/**
 * Downloads the site picture (og:image of the reading page) for works that have no picture yet,
 * at most `limit` per run, or only for `workId`. A picture that several series name is the site's
 * logo: it is used for none of them. Failures are remembered, so a broken address is not fetched
 * on every event.
 */
export async function fillSiteCovers(
  db: Db,
  download: (url: string) => Promise<DownloadResult> = downloadImage,
  { limit = 5, now = new Date(), workId: onlyWork }: { limit?: number; now?: Date; workId?: string } = {},
): Promise<number> {
  const retryBefore = new Date(now.getTime() - RETRY_AFTER_MS);
  const waiting = await db
    .selectDistinctOn([workLinks.workId], { workId: workLinks.workId, coverUrl: workLinks.coverUrl })
    .from(workLinks)
    .leftJoin(workCovers, eq(workCovers.workId, workLinks.workId))
    .where(
      and(
        isNotNull(workLinks.coverUrl),
        onlyWork ? eq(workLinks.workId, onlyWork) : undefined,
        or(
          isNull(workCovers.workId),
          and(
            eq(workCovers.kind, "unusable"),
            or(ne(workCovers.sourceUrl, workLinks.coverUrl), lt(workCovers.updatedAt, retryBefore)),
          ),
        ),
      ),
    )
    // The newest link carries the site's current picture.
    .orderBy(workLinks.workId, desc(workLinks.confirmedAt))
    .limit(limit);

  let stored = 0;
  for (const { workId, coverUrl } of waiting) {
    if (!coverUrl) continue;
    const series = await db.selectDistinct({ workId: workLinks.workId }).from(workLinks).where(eq(workLinks.coverUrl, coverUrl)).limit(2);
    if (series.length > 1) {
      await markUnusable(db, workId, coverUrl, now);
      await db
        .update(workCovers)
        .set({ kind: "unusable", mime: null, image: null, updatedAt: now })
        .where(and(eq(workCovers.kind, "site"), eq(workCovers.sourceUrl, coverUrl)));
      continue;
    }

    const result = await download(coverUrl);
    if (!result.ok) {
      await markUnusable(db, workId, coverUrl, now);
      continue;
    }
    const values = { kind: "site" as const, mime: result.mime, image: result.bytes, sourceUrl: coverUrl, updatedAt: now };
    // Only into an empty or failed slot: a picture added meanwhile by hand stays.
    const written = await db
      .insert(workCovers)
      .values({ workId, ...values })
      .onConflictDoUpdate({ target: workCovers.workId, set: values, setWhere: sql`${workCovers.kind} = 'unusable'` })
      .returning({ workId: workCovers.workId });
    stored += written.length;
  }
  return stored;
}

async function markUnusable(db: Db, workId: string, sourceUrl: string, now: Date): Promise<void> {
  const values = { kind: "unusable" as const, mime: null, image: null, sourceUrl, updatedAt: now };
  await db
    .insert(workCovers)
    .values({ workId, ...values })
    .onConflictDoUpdate({ target: workCovers.workId, set: values, setWhere: sql`${workCovers.kind} = 'unusable'` });
}

async function requireWork(db: Db, workId: string): Promise<void> {
  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.id, workId));
  if (!work) throw new WorkNotFoundError();
}
