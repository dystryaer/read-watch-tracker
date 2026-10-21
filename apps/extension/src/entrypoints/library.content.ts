import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { isLibraryPage, readLibrary } from "@/library/pages";
import { syncOnChanges } from "@/lib/page-sync";

const URL_CHECK_MS = 2000;

// Fixed app domains (SPEC §7.2): opening the WebNovel or Kindle library in Brave syncs every book
// listed there (SPEC §9.1/§9.2). Both are single-page apps, so the page is checked as it changes.
export default defineContentScript({
  matches: ["https://www.webnovel.com/*", "https://read.amazon.com/*"],
  runAt: "document_idle",
  main() {
    let stop: (() => void) | undefined;
    let watchedUrl: string | undefined;

    const follow = () => {
      if (location.href === watchedUrl) return;
      watchedUrl = location.href;
      stop?.();
      stop = undefined;
      if (!isLibraryPage(new URL(location.href))) return;
      stop = syncOnChanges(
        document,
        () => readLibrary(document, new URL(location.href)),
        (entries) => void browser.runtime.sendMessage({ type: "library:sync", url: location.href, entries }),
      );
    };
    follow();
    setInterval(follow, URL_CHECK_MS);
  },
});
