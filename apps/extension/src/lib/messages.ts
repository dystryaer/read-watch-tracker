import { cleanText, HttpUrlSchema, MAX_TEXT_LENGTH, SourceKey } from "@rwt/core";
import { z } from "zod";

/**
 * Messages between the reader content script, the popup/options pages and the background
 * service worker. The background validates every message and checks who sent it.
 */

export const Detection = z.object({
  chapter: z.number().min(0).max(99999.99),
  seriesKey: z.string().min(1).max(MAX_TEXT_LENGTH),
  title: cleanText(MAX_TEXT_LENGTH).nullable(),
  seriesUrl: HttpUrlSchema.nullable(),
  /** Preview image of the page (og:image); only a reader on the page itself can see it. */
  coverUrl: HttpUrlSchema.nullable().optional(),
});
export type Detection = z.infer<typeof Detection>;

export const ReadSignal = z.enum(["scroll", "end-visible", "next-chapter"]);
export type ReadSignal = z.infer<typeof ReadSignal>;

/** What a streaming page plays (SPEC §7.5); a movie is the only detection without an episode. */
export const StreamDetection = z
  .object({
    kind: z.enum(["episode", "movie"]),
    seriesTitle: cleanText(MAX_TEXT_LENGTH),
    season: z.number().int().min(1).max(999).nullable(),
    episode: z.number().int().min(1).max(99999).nullable(),
    seriesUrl: HttpUrlSchema.nullable(),
  })
  .refine((detection) => (detection.kind === "movie") === (detection.episode === null), "an episode needs a number, a movie none");
export type StreamDetection = z.infer<typeof StreamDetection>;

/** A book on the WebNovel or Kindle library page (SPEC §9): WebNovel in chapters, Kindle in percent. */
export const LibraryEntry = z.object({
  externalKey: z.string().regex(/^[A-Za-z0-9]{1,40}$/),
  title: cleanText(MAX_TEXT_LENGTH),
  chapter: z.number().min(0).max(99999.99).optional(),
  percent: z.number().min(0).max(100).optional(),
  seriesUrl: HttpUrlSchema.nullable(),
});
export type LibraryEntry = z.infer<typeof LibraryEntry>;

/** An episode on a streaming service's history page (SPEC §7.6). */
export const HistoryEntry = z.object({
  seriesTitle: cleanText(MAX_TEXT_LENGTH),
  season: z.number().int().min(1).max(999).nullable(),
  episode: z.number().int().min(1).max(99999),
  seriesUrl: HttpUrlSchema.nullable(),
});

// Entries are checked one by one in the router: one odd card on the page does not stop the sync.
const PageEntries = z.array(z.unknown()).max(500);

/** Sent by the reader script on an enabled manga site, or the streaming script on a service's pages. */
export const ContentMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reader:hello"), url: HttpUrlSchema }),
  z.object({ type: z.literal("reader:detected"), url: HttpUrlSchema, detection: Detection.nullable() }),
  z.object({ type: z.literal("reader:chapter-read"), url: HttpUrlSchema, detection: Detection, signal: ReadSignal }),
  z.object({ type: z.literal("stream:hello"), url: HttpUrlSchema }),
  z.object({ type: z.literal("stream:detected"), url: HttpUrlSchema, detection: StreamDetection.nullable() }),
  // The page sends what it shows at that moment; a player frame cannot know it and sends none.
  z.object({ type: z.literal("stream:watched"), url: HttpUrlSchema, detection: StreamDetection.nullable().optional() }),
  z.object({
    type: z.literal("stream:library"),
    url: HttpUrlSchema,
    entries: PageEntries,
  }),
  z.object({ type: z.literal("library:sync"), url: HttpUrlSchema, entries: PageEntries }),
]);
export type ContentMessage = z.infer<typeof ContentMessage>;

const TabId = z.number().int().min(0);

/** Sent by the extension's own popup and options pages – never accepted from content scripts. */
export const ExtensionPageMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("popup:status"), tabId: TabId }),
  z.object({
    type: z.literal("popup:enable-site"),
    tabId: TabId,
    name: cleanText(100).optional(),
    moveFromSourceKey: SourceKey.optional(),
  }),
  z.object({ type: z.literal("popup:ignore-series"), tabId: TabId }),
  z.object({ type: z.literal("options:sync-now") }),
  z.object({
    type: z.literal("options:backfill"),
    entries: z.array(z.object({ url: HttpUrlSchema, visitedAt: z.number().min(0), detection: Detection })).max(2000),
  }),
]);
export type ExtensionPageMessage = z.infer<typeof ExtensionPageMessage>;

interface SenderLike {
  id?: string;
  url?: string;
  tab?: { id?: number };
}

export type SenderKind = { kind: "content"; tabId: number } | { kind: "page" } | { kind: "foreign" };

/**
 * Who sent a runtime message. The browser sets `sender.url` to the sending frame, so a page cannot
 * fake it: our own popup and options pages (also when opened in a tab) have an extension URL,
 * content scripts the URL of the web page and a tab. Anything else is foreign and ignored.
 */
export function classifySender(sender: SenderLike, extensionId: string): SenderKind {
  if (sender.id !== extensionId) return { kind: "foreign" };
  if (sender.url?.startsWith(`chrome-extension://${extensionId}/`)) return { kind: "page" };
  if (sender.tab?.id !== undefined) return { kind: "content", tabId: sender.tab.id };
  return { kind: "foreign" };
}

/** What the popup shows for the active tab; built by the background. */
export const PopupStatus = z.object({
  ok: z.literal(true),
  paired: z.boolean(),
  watchedPercent: z.number().min(1).max(100),
  apiUrl: HttpUrlSchema.nullable(),
  page: z
    .object({
      url: HttpUrlSchema,
      origin: HttpUrlSchema,
      domain: z.string().max(253),
      site: z.object({ sourceKey: SourceKey, domains: z.array(z.string().max(253)) }).nullable(),
      permission: z.boolean(),
      detection: Detection.nullable(),
      counted: z.boolean(),
      ignored: z.boolean(),
      service: z.object({ key: SourceKey, name: z.string().max(100) }).nullable(),
      stream: StreamDetection.nullable(),
    })
    .nullable(),
  sites: z.array(z.object({ sourceKey: SourceKey, domains: z.array(z.string().max(253)) })),
  outbox: z.object({ queued: z.number().int(), lastSyncAt: z.number().nullable(), lastError: z.string().nullable() }),
});
export type PopupStatus = z.infer<typeof PopupStatus>;

export const ActionReply = z.union([z.object({ ok: z.literal(true) }).loose(), z.object({ ok: z.literal(false), error: z.string().max(300).optional() })]);
