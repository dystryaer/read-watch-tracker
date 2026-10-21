import { cleanText, DeviceName, HttpUrlSchema, MAX_TEXT_LENGTH, SourceKey } from "@rwt/core";
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
const ApiOrigin = HttpUrlSchema;

/** Sent by the extension's own popup and options pages – never accepted from content scripts. */
export const ExtensionPageMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("popup:status"), tabId: TabId }),
  z.object({
    type: z.literal("popup:enable-site"),
    tabId: TabId,
    name: cleanText(100).optional(),
    moveFromSourceKey: SourceKey.optional(),
  }),
  z.object({ type: z.literal("popup:disable-site"), tabId: TabId }),
  z.object({ type: z.literal("popup:ignore-series"), tabId: TabId }),
  z.object({ type: z.literal("options:start-pairing"), apiUrl: ApiOrigin, deviceName: DeviceName }),
  z.object({ type: z.literal("options:unpair") }),
  z.object({ type: z.literal("options:sync-now") }),
  z.object({ type: z.literal("options:backfill") }),
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
