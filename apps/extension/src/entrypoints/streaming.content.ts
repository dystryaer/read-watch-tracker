import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { z } from "zod";
import { readHistory } from "@/streaming/history";
import { detectFromMediaMetadata, detectStream, STREAMING_MATCHES } from "@/streaming/services";
import { watchVideos } from "@/streaming/watch-video";

const CHECK_MS = 2000;
const HISTORY_DEBOUNCE_MS = 1500;

// The background's answer is validated like any other input.
const Hello = z.object({ ok: z.literal(true), watchedPercent: z.number().min(1).max(100) });

// Fixed service domains (SPEC §7.2). Every frame watches its videos; only the page itself reports
// what is playing, so a player frame (Crunchyroll) and the page work together in the background.
export default defineContentScript({
  matches: STREAMING_MATCHES,
  allFrames: true,
  runAt: "document_idle",
  async main() {
    const hello = Hello.safeParse(await browser.runtime.sendMessage({ type: "stream:hello", url: location.href }));
    if (!hello.success) return;

    watchVideos({
      document,
      watchedPercent: hello.data.watchedPercent,
      // The end-to-end test plays a recorded clip of a few seconds.
      ...(__RWT_E2E__ ? { minSeconds: 1 } : {}),
      onWatched: () => void browser.runtime.sendMessage({ type: "stream:watched", url: location.href }),
    });
    if (window.top !== window) return;

    // The players are single-page apps: the episode changes without a page load.
    let reported: string | undefined;
    const report = () => {
      const detection = detectFromMediaMetadata(navigator.mediaSession?.metadata) ?? detectStream(document, new URL(location.href));
      const fingerprint = JSON.stringify([location.href, detection]);
      if (fingerprint === reported) return;
      reported = fingerprint;
      void browser.runtime.sendMessage({ type: "stream:detected", url: location.href, detection });
    };
    report();
    setInterval(report, CHECK_MS);

    // History pages (SPEC §7.6): the visible entries go over as one batch, again when more load.
    let synced: string | undefined;
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const syncHistory = () => {
      const entries = readHistory(document, new URL(location.href));
      if (!entries || entries.length === 0) return;
      const fingerprint = JSON.stringify(entries);
      if (fingerprint === synced) return;
      synced = fingerprint;
      void browser.runtime.sendMessage({ type: "stream:library", url: location.href, entries });
    };
    new MutationObserver(() => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(syncHistory, HISTORY_DEBOUNCE_MS);
    }).observe(document.body, { childList: true, subtree: true });
    syncHistory();
  },
});
