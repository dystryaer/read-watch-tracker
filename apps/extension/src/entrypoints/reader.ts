import { SiteRule, Thresholds } from "@rwt/core";
import { browser } from "wxt/browser";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { z } from "zod";
import { detectChapter } from "@/reading/engine";
import { watchChapterEnd } from "@/reading/end-detector";

const STABLE_MS = 2000;
const URL_CHECK_MS = 1000;

// The background's answer is validated like any other input.
const Hello = z.object({ ok: z.literal(true), site: SiteRule.nullable(), thresholds: Thresholds });

// Registered at runtime for enabled sites only (SPEC §7.2), never through the manifest.
export default defineUnlistedScript(async () => {
  const hello = Hello.safeParse(await browser.runtime.sendMessage({ type: "reader:hello", url: location.href }));
  if (!hello.success || !hello.data.site) return;
  const { site, thresholds } = hello.data;

  let stopWatching: (() => void) | undefined;
  let generation = 0;

  async function evaluate() {
    stopWatching?.();
    stopWatching = undefined;
    const run = ++generation;
    const url = location.href;

    const detection = detectChapter(document, url, site);
    await browser.runtime.sendMessage({ type: "reader:detected", url, detection });
    if (!detection) return;

    // Only a detection that is still the same after 2 s counts (SPEC §7.4).
    await new Promise((resolve) => setTimeout(resolve, STABLE_MS));
    if (run !== generation || location.href !== url) return;
    const stable = detectChapter(document, url, site);
    if (!stable || stable.chapter !== detection.chapter || stable.seriesKey !== detection.seriesKey) return;

    stopWatching = watchChapterEnd({
      window,
      document,
      scrollDepthPercent: thresholds.scrollDepthPercent,
      endSelector: site.endSelector,
      onEnd: (signal) => void browser.runtime.sendMessage({ type: "reader:chapter-read", url, detection: stable, signal }),
    });
  }

  // Many readers switch chapters without a page load.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    void evaluate();
  }, URL_CHECK_MS);

  await evaluate();
});
