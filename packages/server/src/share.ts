import { randomUUID } from "node:crypto";
import {
  cleanTextValue,
  knownService,
  MAX_TEXT_LENGTH,
  parseShare,
  ProgressEvent,
  type ShareConfirmRequest,
  type ShareConfirmResponse,
  type ShareResponse,
} from "@rwt/core";
import { type Db, shares, sources, workLinks, works } from "@rwt/db";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { ingestEvents } from "./ingest";
import { currentPosition } from "./work-progress";

const SHARE_TTL_MS = 15 * 60_000;
const CLEANUP_AFTER_MS = 24 * 60 * 60_000;
const URLS = /https?:\/\/\S+/gi;
const QUOTES = /[„“”"‚‘’'«»]/g;
const percentFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

/** Unknown, expired, already used, or started by another device. */
export class ShareNotFoundError extends Error {
  constructor() {
    super("Share not found");
    this.name = "ShareNotFoundError";
  }
}

/** A chapter for a book counted in percent, or the other way round. */
export class ShareValueError extends Error {
  constructor() {
    super("Share value does not fit the book");
    this.name = "ShareValueError";
  }
}

type Source = typeof sources.$inferSelect;
type Unit = ShareResponse["unit"];

async function appSource(db: Db, key: "webnovel" | "kindle"): Promise<Source> {
  const service = knownService(key);
  if (!service) throw new Error(`Unknown app ${key}`);
  await db.insert(sources).values({ key, name: service.name, kind: service.kind, defaultMediaType: service.defaultMediaType }).onConflictDoNothing();
  const [source] = await db.select().from(sources).where(eq(sources.key, key));
  if (!source) throw new Error(`Source ${key} could not be created`);
  return source;
}

const unitOf = (key: "webnovel" | "kindle"): Unit => (key === "kindle" ? "percent" : "chapter");

/**
 * A title from the shared text: cleaned like every other title (no control or bidi characters),
 * the link and quotation marks removed ("„Project Hail Mary“ von Andy Weir").
 */
function titleFromText(text: string | undefined): string | null {
  const title = cleanTextValue(cleanTextValue(text ?? "").replace(URLS, " ").replace(QUOTES, "")).replace(/[\s:–—-]+$/u, "");
  return title === "" ? null : title.slice(0, MAX_TEXT_LENGTH).trim();
}

async function linkedWork(db: Db, sourceId: string, externalKey: string) {
  const [linked] = await db
    .select({ work: works })
    .from(workLinks)
    .innerJoin(works, eq(works.id, workLinks.workId))
    .where(and(eq(workLinks.sourceId, sourceId), eq(workLinks.externalKey, externalKey)));
  return linked?.work ?? null;
}

/**
 * Step 1 of the iOS shortcut (SPEC §9.4): which book is this, where does it stand, and what to
 * suggest – chapter n+1 or the last percentage. Null when the share names no known kind of book.
 */
export async function startShare(db: Db, deviceId: string, input: { url?: string; text?: string }, now = new Date()): Promise<ShareResponse | null> {
  const book = parseShare(input);
  if (!book) return null;
  const source = await appSource(db, book.source);
  const work = await linkedWork(db, source.id, book.externalKey);
  const unit = unitOf(book.source);

  const position = work ? currentPosition(work) : null;
  const current = position?.unit === "chapter" ? position.chapter : position?.unit === "percent" ? position.percent : null;
  const suggested = current === null ? null : unit === "chapter" ? Math.floor(current) + 1 : current;
  const rawTitle = titleFromText(input.text) ?? `${source.name} ${book.externalKey}`;

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
    .where(and(eq(shares.id, input.shareId), eq(shares.deviceId, deviceId), isNull(shares.usedAt), gt(shares.expiresAt, now)));
  if (!share || (share.sourceKey !== "webnovel" && share.sourceKey !== "kindle")) throw new ShareNotFoundError();
  const unit = unitOf(share.sourceKey);
  const value = unit === "chapter" ? input.chapter : input.percent;
  if (value === undefined) throw new ShareValueError();

  // Built before the claim: a value the event schema refuses must not use up the share.
  const event = ProgressEvent.safeParse({
    id: randomUUID(),
    occurredAt: now.toISOString(),
    kind: "read",
    source: { key: share.sourceKey, externalKey: share.externalKey, rawTitle: share.rawTitle },
    position: unit === "chapter" ? { unit: "chapter", chapter: value } : { unit: "percent", percent: value },
  });
  if (!event.success) throw new ShareValueError();

  // Claimed atomically: a shortcut that sends twice saves once.
  const claimed = await db
    .update(shares)
    .set({ usedAt: now })
    .where(and(eq(shares.id, share.id), isNull(shares.usedAt)))
    .returning({ id: shares.id });
  if (claimed.length === 0) throw new ShareNotFoundError();

  const [result] = await ingestEvents(db, deviceId, [event.data], now).catch(async (error: unknown) => {
    // Nothing was saved, so the shortcut may try again.
    await db.update(shares).set({ usedAt: null }).where(eq(shares.id, share.id));
    throw error;
  });
  const outcome = result?.outcome ?? "rejected";

  const source = await appSource(db, share.sourceKey);
  const title = (await linkedWork(db, source.id, share.externalKey))?.title ?? share.rawTitle;
  return { outcome, title, message: messageFor(outcome, title, unit, value) };
}

function messageFor(outcome: ShareConfirmResponse["outcome"], title: string, unit: Unit, value: number): string {
  const position = unit === "chapter" ? `Kap. ${value}` : `${percentFormat.format(value)} %`;
  switch (outcome) {
    case "applied":
      return `${title} → ${position} gespeichert`;
    case "no_change":
      return `${title} steht schon weiter – nichts geändert`;
    case "pending":
      return "Neuer Titel – bitte im Tracker zuordnen";
    case "ignored":
      return `${title} wird ignoriert`;
    case "rejected":
      return "Diese Angabe konnte nicht gespeichert werden";
  }
}
