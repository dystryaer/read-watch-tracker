import {
  type EventOutcome,
  knownService,
  normalizeDomain,
  normalizeTitle,
  parseHttpUrl,
  type Position,
  type ProgressEvent,
} from "@rwt/core";
import {
  type Db,
  events,
  type MatchCandidate,
  pendingMatches,
  sourceDomains,
  sources,
  workLinks,
  works,
} from "@rwt/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { applyProgress, mediaTypesFor, positionColumns, type Work } from "./work-progress";

export interface IngestResult {
  id: string;
  outcome: EventOutcome;
}

type Source = typeof sources.$inferSelect;

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_CANDIDATES = 3;

/**
 * Processes validated events in order (SPEC §5.3). Each event runs in its own transaction,
 * so one failing event cannot undo the others.
 */
export async function ingestEvents(
  db: Db,
  deviceId: string | null,
  batch: ProgressEvent[],
  now = new Date(),
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const event of batch) {
    const outcome = await db.transaction((tx) => ingestOne(tx, deviceId, event, now));
    results.push({ id: event.id, outcome });
  }
  return results;
}

async function ingestOne(db: Db, deviceId: string | null, event: ProgressEvent, now: Date): Promise<EventOutcome> {
  const [duplicate] = await db.select({ id: events.id }).from(events).where(eq(events.id, event.id));
  if (duplicate) return "no_change";

  const occurredAt = clampToNow(new Date(event.occurredAt), now);
  const source = await resolveSource(db, event.source);
  const urls = await urlsOnSource(db, source, event.source);
  const work = await findLinkedWork(db, source.id, event);

  let outcome: EventOutcome;
  if (work) {
    outcome = await applyProgress(
      db,
      work,
      { position: event.position, kind: event.kind, sourceId: source.id, url: urls.url, occurredAt },
      now,
    );
    if (urls.seriesUrl) {
      await db
        .update(workLinks)
        .set({ seriesUrl: urls.seriesUrl })
        .where(and(eq(workLinks.sourceId, source.id), eq(workLinks.externalKey, event.source.externalKey)));
    }
  } else if (await isIgnored(db, source.id, event.source.externalKey)) {
    outcome = "ignored";
  } else {
    await upsertPendingMatch(db, source.id, event, now);
    outcome = "pending";
  }

  await db.insert(events).values({
    id: event.id,
    deviceId,
    sourceId: source.id,
    kind: event.kind,
    externalKey: event.source.externalKey,
    rawTitle: event.source.rawTitle,
    url: urls.url,
    ...positionColumns(event.position),
    occurredAt,
    receivedAt: now,
    workId: work?.id ?? null,
    outcome,
  });
  return outcome;
}

/**
 * For websites only URLs on the source's own domains are kept: a stolen device token must not be
 * able to plant links to other hosts behind "Weiterlesen". Services and apps keep theirs.
 */
async function urlsOnSource(
  db: Db,
  source: Source,
  input: ProgressEvent["source"],
): Promise<{ url: string | null; seriesUrl: string | null }> {
  if (source.kind !== "website") return { url: input.url ?? null, seriesUrl: input.seriesUrl ?? null };
  const rows = await db.select({ domain: sourceDomains.domain }).from(sourceDomains).where(eq(sourceDomains.sourceId, source.id));
  const domains = new Set(rows.map((row) => row.domain));
  const onSource = (value: string | undefined) => {
    const host = parseHttpUrl(value)?.hostname;
    return value && host && domains.has(normalizeDomain(host)) ? value : null;
  };
  return { url: onSource(input.url), seriesUrl: onSource(input.seriesUrl) };
}

function clampToNow(occurredAt: Date, now: Date): Date {
  return occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS ? now : occurredAt;
}

/** The URL's domain wins over the key: after a domain move the client's key may be stale. */
async function resolveSource(db: Db, input: ProgressEvent["source"]): Promise<Source> {
  const hostname = parseHttpUrl(input.url)?.hostname;
  if (hostname) {
    const [byDomain] = await db
      .select({ source: sources })
      .from(sourceDomains)
      .innerJoin(sources, eq(sources.id, sourceDomains.sourceId))
      .where(eq(sourceDomains.domain, normalizeDomain(hostname)));
    if (byDomain) return byDomain.source;
  }

  const [byKey] = await db.select().from(sources).where(eq(sources.key, input.key));
  if (byKey) return byKey;

  const service = knownService(input.key);
  const [created] = await db
    .insert(sources)
    .values({
      key: input.key,
      name: service?.name ?? input.key,
      kind: service?.kind ?? "website",
      defaultMediaType: service?.defaultMediaType ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [existing] = await db.select().from(sources).where(eq(sources.key, input.key));
  if (!existing) throw new Error(`Source ${input.key} could not be created`);
  return existing;
}

/**
 * Exact link first (step 3). Otherwise a bereits bestätigte series whose title is exactly the same
 * on this source is re-recognized under the new key (step 4) – only when that is unambiguous.
 */
async function findLinkedWork(db: Db, sourceId: string, event: ProgressEvent): Promise<Work | null> {
  const [linked] = await db
    .select({ work: works })
    .from(workLinks)
    .innerJoin(works, eq(works.id, workLinks.workId))
    .where(and(eq(workLinks.sourceId, sourceId), eq(workLinks.externalKey, event.source.externalKey)));
  if (linked) return linked.work;

  const titleKey = normalizeTitle(event.source.rawTitle);
  if (titleKey === "" || event.position.unit === "none") return null;

  const sameTitle = await db
    .selectDistinct({ work: works })
    .from(workLinks)
    .innerJoin(works, eq(works.id, workLinks.workId))
    .where(
      and(
        eq(workLinks.sourceId, sourceId),
        eq(workLinks.externalTitleNormalized, titleKey),
        inArray(works.type, mediaTypesFor(event.position.unit)),
      ),
    )
    .limit(2);
  const [match] = sameTitle;
  if (!match || sameTitle.length > 1) return null;

  await db
    .insert(workLinks)
    .values({
      workId: match.work.id,
      sourceId,
      externalKey: event.source.externalKey,
      externalTitle: event.source.rawTitle,
      externalTitleNormalized: titleKey,
      seriesUrl: event.source.seriesUrl ?? null,
    })
    .onConflictDoNothing();
  return match.work;
}

async function isIgnored(db: Db, sourceId: string, externalKey: string): Promise<boolean> {
  const [ignored] = await db
    .select({ id: pendingMatches.id })
    .from(pendingMatches)
    .where(
      and(
        eq(pendingMatches.sourceId, sourceId),
        eq(pendingMatches.externalKey, externalKey),
        eq(pendingMatches.resolution, "ignored"),
      ),
    )
    .limit(1);
  return ignored !== undefined;
}

async function upsertPendingMatch(db: Db, sourceId: string, event: ProgressEvent, now: Date): Promise<void> {
  const candidates = await findCandidates(db, normalizeTitle(event.source.rawTitle), event.position.unit);
  const [open] = await db
    .select()
    .from(pendingMatches)
    .where(
      and(
        eq(pendingMatches.sourceId, sourceId),
        eq(pendingMatches.externalKey, event.source.externalKey),
        isNull(pendingMatches.resolvedAt),
      ),
    );

  if (open) {
    await db
      .update(pendingMatches)
      .set({
        rawTitle: event.source.rawTitle,
        candidates,
        eventCount: open.eventCount + 1,
        lastSeenAt: now,
        seriesUrl: event.source.seriesUrl ?? open.seriesUrl,
        mediaTypeHint: event.mediaTypeHint ?? open.mediaTypeHint,
      })
      .where(eq(pendingMatches.id, open.id));
    return;
  }

  await db.insert(pendingMatches).values({
    sourceId,
    externalKey: event.source.externalKey,
    rawTitle: event.source.rawTitle,
    mediaTypeHint: event.mediaTypeHint ?? null,
    seriesUrl: event.source.seriesUrl ?? null,
    candidates,
    eventCount: 1,
    firstSeenAt: now,
    lastSeenAt: now,
  });
}

/** Up to three works with trigram similarity ≥ 0.3 (pg_trgm's `%` threshold) whose type fits. */
export async function findCandidates(db: Db, titleKey: string, unit: Position["unit"]): Promise<MatchCandidate[]> {
  if (titleKey === "") return [];
  const typeFilter = unit === "none" ? undefined : inArray(works.type, mediaTypesFor(unit));

  const workScore = sql<number>`similarity(${works.titleNormalized}, ${titleKey})`.mapWith(Number);
  const byTitle = await db
    .select({ workId: works.id, score: workScore })
    .from(works)
    .where(and(sql`${works.titleNormalized} % ${titleKey}`, typeFilter))
    .orderBy(desc(workScore))
    .limit(10);

  const linkScore = sql<number>`similarity(${workLinks.externalTitleNormalized}, ${titleKey})`.mapWith(Number);
  const byAlias = await db
    .select({ workId: workLinks.workId, score: linkScore })
    .from(workLinks)
    .innerJoin(works, eq(works.id, workLinks.workId))
    .where(and(sql`${workLinks.externalTitleNormalized} % ${titleKey}`, typeFilter))
    .orderBy(desc(linkScore))
    .limit(10);

  const best = new Map<string, number>();
  for (const { workId, score } of [...byTitle, ...byAlias]) {
    best.set(workId, Math.max(best.get(workId) ?? 0, score));
  }
  return [...best]
    .map(([workId, score]) => ({ workId, score: Math.round(score * 100) / 100 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}
