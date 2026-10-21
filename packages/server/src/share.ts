import { randomUUID } from "node:crypto";
import {
  knownService,
  parseShare,
  type Position,
  positionUnitFor,
  ProgressEvent,
  type ShareConfirmRequest,
  type ShareConfirmResponse,
  type ShareResponse,
  sharedTitle,
} from "@rwt/core";
import { type Db, pendingMatches, shares } from "@rwt/db";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { findExactLink, ingestEvents, sourceByKey } from "./ingest";
import { currentPosition, type Work } from "./work-progress";

const SHARE_TTL_MS = 15 * 60_000;
const CLEANUP_AFTER_MS = 24 * 60 * 60_000;
const percentFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

type App = "webnovel" | "kindle";
type Unit = ShareResponse["unit"];

/** Unknown, expired, or started by another device. */
export class ShareNotFoundError extends Error {
  constructor() {
    super("Share not found");
    this.name = "ShareNotFoundError";
  }
}

/** Confirmed already – usually the shortcut sending again after a timeout. */
export class ShareUsedError extends Error {
  constructor() {
    super("Share already used");
    this.name = "ShareUsedError";
  }
}

/** A chapter for a book counted in percent, the other way round, or a number no position can hold. */
export class ShareValueError extends Error {
  constructor() {
    super("Share value does not fit the book");
    this.name = "ShareValueError";
  }
}

const isApp = (key: string): key is App => key === "webnovel" || key === "kindle";

/** Where a shared book can be opened: its WebNovel page, or the book in the Kindle web reader. */
const BOOK_URLS: Record<App, (externalKey: string) => string> = {
  webnovel: (externalKey) => `https://www.webnovel.com/book/${externalKey}`,
  kindle: (externalKey) => `https://read.amazon.com/?asin=${externalKey}`,
};

/**
 * The unit to ask in: the linked work's (a Kindle book may have been assigned to a light novel),
 * otherwise the app's own – chapters for WebNovel, percent for Kindle.
 */
function unitFor(app: App, work: Work | null): Unit {
  for (const mediaType of [work?.type, knownService(app)?.defaultMediaType]) {
    const unit = mediaType ? positionUnitFor(mediaType) : null;
    if (unit === "chapter" || unit === "percent") return unit;
  }
  return "chapter";
}

function valueOf(position: Position | null): number | null {
  if (position?.unit === "chapter") return position.chapter;
  if (position?.unit === "percent") return position.percent;
  return null;
}

function formatPosition(unit: Unit, value: number): string {
  return unit === "chapter" ? `Kap. ${value}` : `${percentFormat.format(value)} %`;
}

async function waitingCardTitle(db: Db, sourceId: string, externalKey: string): Promise<string | null> {
  const [card] = await db
    .select({ rawTitle: pendingMatches.rawTitle })
    .from(pendingMatches)
    .where(and(eq(pendingMatches.sourceId, sourceId), eq(pendingMatches.externalKey, externalKey), isNull(pendingMatches.resolvedAt)));
  return card?.rawTitle ?? null;
}

/**
 * Step 1 of the iOS shortcut (SPEC §9.4): which book is this, where does it stand, and what to
 * suggest – chapter n+1 or the last percentage. Null when the share names no known kind of book.
 */
export async function startShare(db: Db, deviceId: string, input: { url?: string; text?: string }, now = new Date()): Promise<ShareResponse | null> {
  const book = parseShare(input);
  if (!book) return null;
  const source = await sourceByKey(db, book.source);
  const work = await findExactLink(db, source.id, book.externalKey);
  const unit = unitFor(book.source, work);

  const current = work ? valueOf(currentPosition(work)) : null;
  const suggested = current === null ? null : unit === "chapter" ? Math.floor(current) + 1 : current;
  // A share without a title must not rename a waiting card: the card would lose its candidates.
  const rawTitle =
    sharedTitle(input) ?? (await waitingCardTitle(db, source.id, book.externalKey)) ?? `${source.name} ${book.externalKey}`;

  await db.delete(shares).where(lt(shares.expiresAt, new Date(now.getTime() - CLEANUP_AFTER_MS)));
  const [share] = await db
    .insert(shares)
    .values({ deviceId, sourceKey: book.source, externalKey: book.externalKey, rawTitle, createdAt: now, expiresAt: new Date(now.getTime() + SHARE_TTL_MS) })
    .returning({ id: shares.id });
  if (!share) throw new Error("Share could not be stored");

  return { shareId: share.id, title: work?.title ?? rawTitle, unit, current, suggested, needsMatch: !work };
}

/**
 * Step 2: the number the user confirmed becomes an event – created here, because shortcuts cannot
 * make UUIDs – and goes through the normal matching, so an unknown book waits at an inbox card.
 */
export async function confirmShare(db: Db, deviceId: string, input: ShareConfirmRequest, now = new Date()): Promise<ShareConfirmResponse> {
  const [share] = await db
    .select()
    .from(shares)
    .where(and(eq(shares.id, input.shareId), eq(shares.deviceId, deviceId), gt(shares.expiresAt, now)));
  if (!share || !isApp(share.sourceKey)) throw new ShareNotFoundError();
  if (share.usedAt) throw new ShareUsedError();
  const app = share.sourceKey;
  const source = await sourceByKey(db, app);
  const unit = unitFor(app, await findExactLink(db, source.id, share.externalKey));
  const value = unit === "chapter" ? input.chapter : input.percent;
  if (value === undefined) throw new ShareValueError();

  // Built before the claim: a value the event schema refuses must not use up the share.
  const event = ProgressEvent.safeParse({
    id: randomUUID(),
    occurredAt: now.toISOString(),
    kind: "read",
    source: { key: app, externalKey: share.externalKey, rawTitle: share.rawTitle, seriesUrl: BOOK_URLS[app](share.externalKey) },
    position: unit === "chapter" ? { unit: "chapter", chapter: value } : { unit: "percent", percent: value },
  });
  if (!event.success) throw new ShareValueError();

  // Claimed atomically: a shortcut that sends twice saves once.
  const claimed = await db
    .update(shares)
    .set({ usedAt: now })
    .where(and(eq(shares.id, share.id), isNull(shares.usedAt)))
    .returning({ id: shares.id });
  if (claimed.length === 0) throw new ShareUsedError();

  const [result] = await ingestEvents(db, deviceId, [event.data], now).catch(async (error: unknown) => {
    // Nothing was saved, so the shortcut may try again.
    await db.update(shares).set({ usedAt: null }).where(eq(shares.id, share.id));
    throw error;
  });
  const outcome = result?.outcome ?? "rejected";

  const work = await findExactLink(db, source.id, share.externalKey);
  const title = work?.title ?? share.rawTitle;
  const saved = work ? currentPosition(work) : null;
  return { outcome, title, message: messageFor(outcome, title, formatPosition(unit, value), saved) };
}

function messageFor(outcome: ShareConfirmResponse["outcome"], title: string, confirmed: string, saved: Position | null): string {
  switch (outcome) {
    case "applied":
      return `${title} → ${confirmed} gespeichert`;
    case "no_change": {
      const value = valueOf(saved);
      const unit = saved?.unit === "percent" ? "percent" : "chapter";
      return value === null ? `${title}: nichts geändert` : `${title} steht schon bei ${formatPosition(unit, value)} – nichts geändert`;
    }
    case "pending":
      return "Neuer Titel – bitte im Tracker zuordnen";
    case "ignored":
      return `${title} wird ignoriert`;
    case "rejected":
      return "Diese Angabe konnte nicht gespeichert werden";
  }
}
