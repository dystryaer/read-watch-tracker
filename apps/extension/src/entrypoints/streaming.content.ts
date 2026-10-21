import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { z } from "zod";
import { syncOnChanges } from "@/lib/page-sync";
import { readHistory } from "@/streaming/history";
import { detectFromMediaMetadata, detectStream, STREAMING_MATCHES, type StreamDetection } from "@/streaming/services";
import { watchVideos } from "@/streaming/watch-video";

const CHECK_MS = 2000;

// The background's answers are validated like any other input.
const Hello = z.object({ ok: z.literal(true), watchedPercent: z.number().min(1).max(100) });
const Reply = z.object({ ok: z.boolean() }).loose();

// Fixed service domains (SPEC §7.2). Every frame watches its videos; only the page itself reports
// what is playing, so a player frame (Crunchyroll) and the page work together in the background.
export default defineContentScript({
  matches: STREAMING_MATCHES,
  allFrames: true,
  runAt: "document_idle",
  async main() {
    const hello = Hello.safeParse(await browser.runtime.sendMessage({ type: "stream:hello", url: location.href }));
    if (!hello.success) return;
    const isPage = window.top === window;

    // The metadata names the episode best; the page layout adds the series link.
    const currentDetection = (): StreamDetection | null => {
      const fromPage = detectStream(document, new URL(location.href));
      const fromMetadata = detectFromMediaMetadata(navigator.mediaSession?.metadata);
      return fromMetadata ? { ...fromMetadata, seriesUrl: fromPage?.seriesUrl ?? null } : fromPage;
    };

    watchVideos({
      document,
      watchedPercent: hello.data.watchedPercent,
      // The end-to-end test plays a recorded clip of a few seconds.
      ...(__RWT_E2E__ ? { minSeconds: 1 } : {}),
      // The page sends what it shows at this moment; the signal is only used up once accepted.
      onWatched: async () => {
        const message = { type: "stream:watched", url: location.href, ...(isPage ? { detection: currentDetection() } : {}) };
        return Reply.safeParse(await browser.runtime.sendMessage(message)).data?.ok === true;
      },
    });
    if (!isPage) return;

    // The players are single-page apps: the episode changes without a page load.
    let reported: string | undefined;
    const report = () => {
      const detection = currentDetection();
      const fingerprint = JSON.stringify([location.href, detection]);
      if (fingerprint === reported) return;
      reported = fingerprint;
      void browser.runtime.sendMessage({ type: "stream:detected", url: location.href, detection });
    };
    report();
    setInterval(report, CHECK_MS);

    // History pages (SPEC §7.6): the visible entries go over as one batch, again when more load.
    syncOnChanges(
      document,
      () => readHistory(document, new URL(location.href)),
      (entries) => void browser.runtime.sendMessage({ type: "stream:library", url: location.href, entries }),
    );
  },
});
