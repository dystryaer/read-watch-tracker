import { HttpUrlSchema, SourceKey } from "@rwt/core";
import { z } from "zod";
import { Detection, StreamDetection } from "./messages";
import type { Store } from "./storage";

export const TabState = z.object({
  url: HttpUrlSchema,
  sourceKey: SourceKey.nullable(),
  detection: Detection.nullable(),
  counted: z.boolean(),
  ignored: z.boolean().optional(),
});
export type TabState = z.infer<typeof TabState>;

/**
 * What the reader script last reported per tab. It lives in chrome.storage.session rather than
 * in worker memory: MV3 stops an idle service worker after about 30 s, long before a chapter is
 * read. One key per tab, so reports from two tabs never overwrite each other.
 */
export function createTabStates(store: Store) {
  const key = (tabId: number) => `tab:${tabId}`;
  return {
    get: (tabId: number) => store.read(key(tabId), TabState.nullable(), null),
    set: (tabId: number, state: TabState) => store.write(key(tabId), state),
    remove: (tabId: number) => store.remove(key(tabId)),
  };
}
export type TabStates = ReturnType<typeof createTabStates>;

export const StreamState = z.object({
  service: z.enum(["netflix", "primevideo", "disneyplus", "crunchyroll"]),
  url: HttpUrlSchema,
  detection: StreamDetection.nullable(),
});
export type StreamState = z.infer<typeof StreamState>;

/** What a streaming page last reported per tab; the player frame's "watched" refers to it. */
export function createStreamStates(store: Store) {
  const key = (tabId: number) => `stream:${tabId}`;
  return {
    get: (tabId: number) => store.read(key(tabId), StreamState.nullable(), null),
    set: (tabId: number, state: StreamState) => store.write(key(tabId), state),
    remove: (tabId: number) => store.remove(key(tabId)),
  };
}
export type StreamStates = ReturnType<typeof createStreamStates>;
