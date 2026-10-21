import { DEFAULT_THRESHOLDS, type DeviceConfig, ProgressEvent, type SiteRule } from "@rwt/core";
import type { ApiClient } from "./api-client";
import { classifySender, ContentMessage, type Detection, ExtensionPageMessage } from "./messages";
import type { Outbox } from "./outbox";
import type { RecentReads } from "./recent";
import { loadCachedConfig } from "./settings";
import { findSiteForUrl } from "./sites";
import type { Store } from "./storage";

export interface TabState {
  url: string;
  detection: Detection | null;
  counted: boolean;
}

export interface RouterDeps {
  extensionId: string;
  store: Store;
  outbox: Pick<Outbox, "enqueue" | "flush">;
  recent: Pick<RecentReads, "claim">;
  api: Partial<Pick<ApiClient, "enableSource">>;
  sync: () => Promise<unknown>;
  browser: unknown;
  now?: () => number;
}

interface SenderLike {
  id?: string;
  url?: string;
  tab?: { id?: number };
}

/**
 * Message handling of the background worker. Content scripts may only report about the site they
 * run on; popup and options commands are accepted from the extension's own pages only.
 */
export function createRouter(deps: RouterDeps) {
  const now = deps.now ?? Date.now;
  const tabs = new Map<number, TabState>();

  async function config(): Promise<DeviceConfig | null> {
    return (await loadCachedConfig(deps.store))?.config ?? null;
  }

  // The reported URL and the page the script actually runs on must belong to the same site.
  function siteFor(current: DeviceConfig | null, url: string, senderUrl: string | undefined): SiteRule | undefined {
    const site = findSiteForUrl(current, url);
    const senderSite = senderUrl ? findSiteForUrl(current, senderUrl) : undefined;
    return site && senderSite?.sourceKey === site.sourceKey ? site : undefined;
  }

  async function handleContent(message: ContentMessage, tabId: number, senderUrl: string | undefined) {
    const current = await config();
    switch (message.type) {
      case "reader:hello":
        return { ok: true, site: siteFor(current, message.url, senderUrl) ?? null, thresholds: current?.thresholds ?? DEFAULT_THRESHOLDS };

      case "reader:detected":
        tabs.set(tabId, { url: message.url, detection: message.detection, counted: false });
        return { ok: true };

      case "reader:chapter-read": {
        const site = siteFor(current, message.url, senderUrl);
        if (!site) return { ok: false };
        const { detection } = message;
        tabs.set(tabId, { url: message.url, detection, counted: true });
        if (!(await deps.recent.claim(`${site.sourceKey}|${detection.seriesKey}|${detection.chapter}`, now()))) {
          return { ok: true, duplicate: true };
        }
        const event = ProgressEvent.parse({
          id: crypto.randomUUID(),
          occurredAt: new Date(now()).toISOString(),
          kind: "read",
          source: {
            key: site.sourceKey,
            externalKey: detection.seriesKey,
            rawTitle: detection.title ?? detection.seriesKey,
            url: message.url,
            ...(detection.seriesUrl ? { seriesUrl: detection.seriesUrl } : {}),
          },
          position: { unit: "chapter", chapter: detection.chapter },
        });
        await deps.outbox.enqueue(event);
        void deps.outbox.flush();
        return { ok: true };
      }
    }
  }

  async function handlePage(message: ExtensionPageMessage) {
    switch (message.type) {
      case "options:sync-now":
        return { ok: true, result: await deps.sync() };
      default:
        return { ok: false };
    }
  }

  return async function route(raw: unknown, sender: SenderLike): Promise<unknown> {
    const from = classifySender(sender, deps.extensionId);
    if (from.kind === "content") {
      const message = ContentMessage.safeParse(raw);
      return message.success ? handleContent(message.data, from.tabId, sender.url) : { ok: false };
    }
    if (from.kind === "page") {
      const message = ExtensionPageMessage.safeParse(raw);
      return message.success ? handlePage(message.data) : { ok: false };
    }
    return { ok: false };
  };
}
