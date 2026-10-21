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
});
export type Detection = z.infer<typeof Detection>;

export const ReadSignal = z.enum(["scroll", "end-visible", "next-chapter"]);
export type ReadSignal = z.infer<typeof ReadSignal>;

/** Sent by the reader script running on an enabled manga site. */
export const ContentMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reader:hello"), url: HttpUrlSchema }),
  z.object({ type: z.literal("reader:detected"), url: HttpUrlSchema, detection: Detection.nullable() }),
  z.object({ type: z.literal("reader:chapter-read"), url: HttpUrlSchema, detection: Detection, signal: ReadSignal }),
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
]);
export type ExtensionPageMessage = z.infer<typeof ExtensionPageMessage>;

interface SenderLike {
  id?: string;
  url?: string;
  tab?: { id?: number };
}

export type SenderKind = { kind: "content"; tabId: number } | { kind: "page" } | { kind: "foreign" };

/**
 * Who sent a runtime message. Content scripts come with a tab; the popup and options pages have no
 * tab and an extension URL. Anything else, including other extensions, is foreign and ignored.
 */
export function classifySender(sender: SenderLike, extensionId: string): SenderKind {
  if (sender.id !== extensionId) return { kind: "foreign" };
  if (sender.tab?.id !== undefined) return { kind: "content", tabId: sender.tab.id };
  if (sender.url?.startsWith(`chrome-extension://${extensionId}/`)) return { kind: "page" };
  return { kind: "foreign" };
}

/** What the popup shows for the active tab; built by the background. */
export const PopupStatus = z.object({
  ok: z.literal(true),
  paired: z.boolean(),
  apiUrl: HttpUrlSchema.nullable(),
  page: z
    .object({
      origin: HttpUrlSchema,
      domain: z.string().max(253),
      site: z.object({ sourceKey: SourceKey, domains: z.array(z.string().max(253)) }).nullable(),
      permission: z.boolean(),
      detection: Detection.nullable(),
      counted: z.boolean(),
      ignored: z.boolean(),
    })
    .nullable(),
  sites: z.array(z.object({ sourceKey: SourceKey, domains: z.array(z.string().max(253)) })),
  outbox: z.object({ queued: z.number().int(), lastSyncAt: z.number().nullable(), lastError: z.string().nullable() }),
});
export type PopupStatus = z.infer<typeof PopupStatus>;

export const ActionReply = z.union([z.object({ ok: z.literal(true) }).loose(), z.object({ ok: z.literal(false), error: z.string().max(300).optional() })]);
