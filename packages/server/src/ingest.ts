import {
  type EventOutcome,
  isServiceUrl,
  knownService,
  normalizeDomain,
  normalizeTitle,
  parseHttpUrl,
  type ProgressEvent,
  streamingSeriesKey,
} from "@rwt/core";
import { type Db, events, pendingMatches, sourceDomains, sources, workLinks, works } from "@rwt/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { findCandidates } from "./candidates";
import { answerOpenMatch } from "./resolve";
import { applyProgress, lockWork, mediaTypesFor, positionColumns, type Work } from "./work-progress";

export interface IngestResult {
  id: string;
  outcome: EventOutcome;
}

type Source = typeof sources.$inferSelect;
interface SourceUrls {
  url: string | null;
  seriesUrl: string | null;
}

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Raised when a concurrent request stored the same event id first; its transaction is rolled back. */
class DuplicateEventError extends Error {}

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
    let outcome: EventOutcome;
    try {
      outcome = await db.transaction((tx) => ingestOne(tx, deviceId, event, now));
    } catch (error) {
      if (!(error instanceof DuplicateEventError)) throw error;
      outcome = "no_change";
    }
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
  const key = externalKeyFor(source, event.source.externalKey);

  // Step 3 (exact link) wins over an earlier "ignore"; step 4 (same title) must not undo one.
  let work = await findExactLink(db, source.id, key);
  let relinked = false;
  const ignored = !work && (await isIgnored(db, source.id, key));
  if (!work && !ignored) {
    const recognized = await reRecognize(db, source.id, event, key, urls.seriesUrl);
    work = recognized?.work ?? null;
    relinked = recognized?.relinked ?? false;
  }

  let outcome: EventOutcome;
  if (work) {
    // A card that waited for this key is answered by the link; its older events go first.
    await answerOpenMatch(db, source.id, key, work.id, now);
    const locked = await lockWork(db, work.id);
    if (!locked) throw new Error(`Work ${work.id} not found`);
    outcome = await applyProgress(
      db,
      locked,
      { position: event.position, kind: event.kind, sourceId: source.id, url: urls.url, occurredAt },
      now,
    );
    if (outcome === "applied" && urls.seriesUrl) {
      await db
        .update(workLinks)
        .set({ seriesUrl: urls.seriesUrl })
        .where(and(eq(workLinks.sourceId, source.id), eq(workLinks.externalKey, key)));
    }
  } else if (ignored) {
    outcome = "ignored";
  } else {
    await upsertPendingMatch(db, source.id, event, key, urls.seriesUrl, now);
    outcome = "pending";
  }

  const stored = await db
    .insert(events)
    .values({
      id: event.id,
      deviceId,
      sourceId: source.id,
      kind: event.kind,
      externalKey: key,
      rawTitle: event.source.rawTitle,
      url: urls.url,
      ...positionColumns(event.position),
      occurredAt,
      receivedAt: now,
      workId: work?.id ?? null,
      outcome,
      relinked,
    })
    // The idempotency gate under concurrency: the second writer of an id waits, then backs out.
    .onConflictDoNothing()
    .returning({ id: events.id });
  if (stored.length === 0) throw new DuplicateEventError();
  return outcome;
}

/**
 * Only URLs on the source's own domains are kept – a website's registered domains, a service's
 * fixed ones: a stolen device token must not be able to plant links to other hosts behind
 * "Weiterlesen" or "Öffnen".
 */
async function urlsOnSource(db: Db, source: Source, input: ProgressEvent["source"]): Promise<SourceUrls> {
  if (source.kind !== "website") {
    const onService = (value: string | undefined) => (value && isServiceUrl(source.key, value) ? value : null);
    return { url: onService(input.url), seriesUrl: onService(input.seriesUrl) };
  }
  const rows = await db.select({ domain: sourceDomains.domain }).from(sourceDomains).where(eq(sourceDomains.sourceId, source.id));
  const domains = new Set(rows.map((row) => row.domain));
  const onSource = (value: string | undefined) => {
    const host = parseHttpUrl(value)?.hostname;
    return value && host && domains.has(normalizeDomain(host)) ? value : null;
  };
  return { url: onSource(input.url), seriesUrl: onSource(input.seriesUrl) };
}

/**
 * Streaming series are keyed by their normalized title (SPEC §5.2). The server derives it itself,
 * so the desktop and the Shield cannot disagree and one confirmation covers both.
 */
function externalKeyFor(source: Source, sent: string): string {
  if (source.kind !== "streaming") return sent;
  return streamingSeriesKey(sent);
}

function clampToNow(occurredAt: Date, now: Date): Date {
  return occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS ? now : occurredAt;
}

/**
 * Websites: the URL's domain wins over the key, since after a domain move the client's key may be
 * stale. Services and apps have fixed keys, so their events never land on a website source.
 */
async function resolveSource(db: Db, input: ProgressEvent["source"]): Promise<Source> {
  const hostname = knownService(input.key) ? undefined : parseHttpUrl(input.url)?.hostname;
  if (hostname) {
    const [byDomain] = await db
      .select({ source: sources })
      .from(sourceDomains)
      .innerJoin(sources, eq(sources.id, sourceDomains.sourceId))
      .where(eq(sourceDomains.domain, normalizeDomain(hostname)));
    if (byDomain) return byDomain.source;
  }

  return sourceByKey(db, input.key);
}

/** The source with this key, created on first use: with the fixed name and kind of a known service. */
export async function sourceByKey(db: Db, key: string): Promise<Source> {
  const [byKey] = await db.select().from(sources).where(eq(sources.key, key));
  if (byKey) return byKey;

  const service = knownService(key);
  const [created] = await db
    .insert(sources)
    .values({ key, name: service?.name ?? key, kind: service?.kind ?? "website", defaultMediaType: service?.defaultMediaType ?? null })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [existing] = await db.select().from(sources).where(eq(sources.key, key));
  if (!existing) throw new Error(`Source ${key} could not be created`);
  return existing;
}

/** Step 3: the key is linked to a work. */
export async function findExactLink(db: Db, sourceId: string, externalKey: string): Promise<Work | null> {
  const [linked] = await db
    .select({ work: works })
    .from(workLinks)
    .innerJoin(works, eq(works.id, workLinks.workId))
    .where(and(eq(workLinks.sourceId, sourceId), eq(workLinks.externalKey, externalKey)));
  return linked?.work ?? null;
}

/**
 * Step 4: a confirmed series whose title is exactly the same on this source is re-recognized
 * under the new key – only when that is unambiguous.
 */
async function reRecognize(
  db: Db,
  sourceId: string,
  event: ProgressEvent,
  externalKey: string,
  seriesUrl: string | null,
): Promise<{ work: Work; relinked: boolean } | null> {
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

  const created = await db
    .insert(workLinks)
    .values({
      workId: match.work.id,
      sourceId,
      externalKey,
      externalTitle: event.source.rawTitle,
      externalTitleNormalized: titleKey,
      seriesUrl,
    })
    .onConflictDoNothing()
    .returning({ id: workLinks.id });
  return { work: match.work, relinked: created.length > 0 };
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

async function upsertPendingMatch(
  db: Db,
  sourceId: string,
  event: ProgressEvent,
  externalKey: string,
  seriesUrl: string | null,
  now: Date,
): Promise<void> {
  const candidates = await findCandidates(db, normalizeTitle(event.source.rawTitle), event.position.unit);
  const [created] = await db
    .insert(pendingMatches)
    .values({
      sourceId,
      externalKey,
      rawTitle: event.source.rawTitle,
      mediaTypeHint: event.mediaTypeHint ?? null,
      seriesUrl,
      candidates,
      eventCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    // At most one open card per key (partial unique index), also against a concurrent insert.
    .onConflictDoNothing()
    .returning({ id: pendingMatches.id });
  if (created) return;

  await db
    .update(pendingMatches)
    .set({
      rawTitle: event.source.rawTitle,
      candidates,
      eventCount: sql`${pendingMatches.eventCount} + 1`,
      lastSeenAt: now,
      ...(seriesUrl ? { seriesUrl } : {}),
      ...(event.mediaTypeHint ? { mediaTypeHint: event.mediaTypeHint } : {}),
    })
    .where(
      and(
        eq(pendingMatches.sourceId, sourceId),
        eq(pendingMatches.externalKey, externalKey),
        isNull(pendingMatches.resolvedAt),
      ),
    );
}
