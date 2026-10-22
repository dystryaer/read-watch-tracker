import { comparePositions, type MediaType, normalizeTitle, positionUnitFor } from "@rwt/core";
import { type Db, devices, events, sourceDomains, sources, workCovers, workLinks, works } from "@rwt/db";
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { WorkNotFoundError } from "./manual";
import { currentPosition, mediaTypesFor, positionColumns, type Work } from "./work-progress";

const HISTORY_LIMIT = 50;

export class MergeIncompatibleError extends Error {
  constructor(message = "These works cannot be merged") {
    super(message);
    this.name = "MergeIncompatibleError";
  }
}

export interface WorkDetail {
  work: Work;
  cover: {
    /** null: never had a picture (tile, until the site names one). */
    kind: (typeof workCovers.$inferSelect)["kind"] | null;
    /** Set when a picture is shown; part of its URL. */
    version: number | null;
    /** A reading page named a picture, so "Bild der Seite verwenden" can bring it (back). */
    siteAvailable: boolean;
  };
  links: {
    id: string;
    sourceName: string;
    sourceKind: (typeof sources.$inferSelect)["kind"];
    externalKey: string;
    externalTitle: string;
    seriesUrl: string | null;
    confirmedAt: Date;
  }[];
  /** What the "Weiterlesen" button needs from the last used source (SPEC §4.4); null without one. */
  lastSource: { nextUrlTemplate: string | null; currentDomain: string | null; seriesUrl: string | null } | null;
  events: {
    id: string;
    kind: (typeof events.$inferSelect)["kind"];
    outcome: (typeof events.$inferSelect)["outcome"];
    occurredAt: Date;
    chapter: number | null;
    season: number | null;
    episode: number | null;
    percent: number | null;
    url: string | null;
    externalKey: string | null;
    /** The event re-recognized the series under a new key (SPEC §5.3 step 4). */
    relinked: boolean;
    sourceName: string | null;
    deviceName: string | null;
  }[];
}

/** Detail page (SPEC §4.3): links per source and the last 50 events. */
export async function getWorkDetail(db: Db, workId: string): Promise<WorkDetail | null> {
  const [work] = await db.select().from(works).where(eq(works.id, workId));
  if (!work) return null;

  const links = await db
    .select({
      id: workLinks.id,
      sourceName: sources.name,
      sourceKind: sources.kind,
      externalKey: workLinks.externalKey,
      externalTitle: workLinks.externalTitle,
      seriesUrl: workLinks.seriesUrl,
      confirmedAt: workLinks.confirmedAt,
    })
    .from(workLinks)
    .innerJoin(sources, eq(sources.id, workLinks.sourceId))
    .where(eq(workLinks.workId, workId))
    .orderBy(sources.name);

  const [cover] = await db
    .select({ kind: workCovers.kind, updatedAt: workCovers.updatedAt })
    .from(workCovers)
    .where(eq(workCovers.workId, workId));
  const [siteCover] = await db
    .select({ id: workLinks.id })
    .from(workLinks)
    .where(and(eq(workLinks.workId, workId), isNotNull(workLinks.coverUrl)))
    .limit(1);

  const history = await db
    .select({
      id: events.id,
      kind: events.kind,
      outcome: events.outcome,
      occurredAt: events.occurredAt,
      chapter: events.chapter,
      season: events.season,
      episode: events.episode,
      percent: events.percent,
      url: events.url,
      externalKey: events.externalKey,
      relinked: events.relinked,
      sourceName: sources.name,
      deviceName: devices.name,
    })
    .from(events)
    .leftJoin(sources, eq(sources.id, events.sourceId))
    .leftJoin(devices, eq(devices.id, events.deviceId))
    .where(eq(events.workId, workId))
    .orderBy(desc(events.occurredAt))
    .limit(HISTORY_LIMIT);

  const shown = cover?.kind === "site" || cover?.kind === "upload";
  return {
    work,
    cover: { kind: cover?.kind ?? null, version: shown ? cover.updatedAt.getTime() : null, siteAvailable: siteCover !== undefined },
    links,
    lastSource: work.lastSourceId ? await lastSourceOf(db, workId, work.lastSourceId) : null,
    events: history,
  };
}

/** Rule template, current domain and series page of the source last read on, as the overview has them. */
async function lastSourceOf(db: Db, workId: string, sourceId: string): Promise<WorkDetail["lastSource"]> {
  const [source] = await db
    .select({ nextUrlTemplate: sources.ruleNextUrlTemplate, currentDomain: sourceDomains.domain })
    .from(sources)
    .leftJoin(sourceDomains, and(eq(sourceDomains.sourceId, sources.id), eq(sourceDomains.isCurrent, true)))
    .where(eq(sources.id, sourceId));
  if (!source) return null;
  const [link] = await db
    .select({ seriesUrl: workLinks.seriesUrl })
    .from(workLinks)
    .where(and(eq(workLinks.workId, workId), eq(workLinks.sourceId, sourceId), isNotNull(workLinks.seriesUrl)))
    // Newest first, like the overview: after a key change the new link carries the current scheme.
    .orderBy(desc(workLinks.confirmedAt))
    .limit(1);
  return { ...source, seriesUrl: link?.seriesUrl ?? null };
}

/** Rename or retype a work; a type that counts progress differently clears the position. */
export async function updateWorkMeta(
  db: Db,
  workId: string,
  changes: { title?: string; type?: MediaType },
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [work] = await tx.select().from(works).where(eq(works.id, workId));
    if (!work) throw new WorkNotFoundError();

    const type = changes.type ?? work.type;
    const keepsPosition = positionUnitFor(type) === positionUnitFor(work.type);
    await tx
      .update(works)
      .set({
        ...(changes.title ? { title: changes.title, titleNormalized: normalizeTitle(changes.title) } : {}),
        type,
        ...(keepsPosition ? {} : { chapter: null, season: null, episode: null, percent: null }),
        updatedAt: now,
      })
      .where(eq(works.id, workId));
  });
}

/** Detaches one source link; later events of that key ask for a new assignment. */
export async function unlinkWork(db: Db, workId: string, linkId: string): Promise<void> {
  await db.delete(workLinks).where(and(eq(workLinks.id, linkId), eq(workLinks.workId, workId)));
}

/**
 * Merges an accidental duplicate into `intoId` (SPEC §4.3): links and events move over, the
 * further position and the more recent activity win, and the duplicate is deleted.
 */
export async function mergeWorks(db: Db, fromId: string, intoId: string, now = new Date()): Promise<void> {
  if (fromId === intoId) throw new MergeIncompatibleError("A work cannot be merged into itself");
  await db.transaction(async (tx) => {
    const [from] = await tx.select().from(works).where(eq(works.id, fromId));
    const [into] = await tx.select().from(works).where(eq(works.id, intoId));
    if (!from || !into) throw new WorkNotFoundError();
    if (positionUnitFor(from.type) !== positionUnitFor(into.type)) {
      throw new MergeIncompatibleError("Works that count progress differently cannot be merged");
    }

    // (source, external key) is unique across all works, so moving links cannot collide.
    await tx.update(workLinks).set({ workId: intoId }).where(eq(workLinks.workId, fromId));
    await tx.update(events).set({ workId: intoId }).where(eq(events.workId, fromId));

    const fromPosition = currentPosition(from);
    const intoPosition = currentPosition(into);
    const furtherPosition =
      fromPosition && (!intoPosition || comparePositions(fromPosition, intoPosition) > 0) ? fromPosition : null;
    const fromIsMoreRecent =
      from.lastProgressAt !== null && (into.lastProgressAt === null || from.lastProgressAt > into.lastProgressAt);
    const fromCheckedLater =
      from.latestChapterAt !== null && (into.latestChapterAt === null || from.latestChapterAt > into.latestChapterAt);

    await tx
      .update(works)
      .set({
        ...(furtherPosition ? positionColumns(furtherPosition, into) : {}),
        ...(fromIsMoreRecent
          ? { lastProgressAt: from.lastProgressAt, lastUrl: from.lastUrl, lastSourceId: from.lastSourceId }
          : {}),
        ...(fromCheckedLater ? { latestChapter: from.latestChapter, latestChapterAt: from.latestChapterAt } : {}),
        updatedAt: now,
      })
      .where(eq(works.id, intoId));
    // The duplicate's picture moves over unless the remaining work has its own (or had it removed).
    const [intoCover] = await tx.select({ kind: workCovers.kind }).from(workCovers).where(eq(workCovers.workId, intoId));
    if (!intoCover || intoCover.kind === "unusable") {
      await tx.delete(workCovers).where(eq(workCovers.workId, intoId));
      await tx
        .update(workCovers)
        .set({ workId: intoId })
        .where(and(eq(workCovers.workId, fromId), inArray(workCovers.kind, ["site", "upload"])));
    }
    await tx.delete(works).where(eq(works.id, fromId));
  });
}

/** Works a duplicate can be merged into: same way of counting progress, sorted by title. */
export async function listMergeCandidates(db: Db, workId: string): Promise<{ id: string; title: string; type: MediaType }[]> {
  const [work] = await db.select({ type: works.type }).from(works).where(eq(works.id, workId));
  if (!work) return [];
  return db
    .select({ id: works.id, title: works.title, type: works.type })
    .from(works)
    .where(and(ne(works.id, workId), inArray(works.type, mediaTypesFor(positionUnitFor(work.type)))))
    .orderBy(asc(works.title));
}
