import { detectChapterFromUrl } from "./detect-url";
import { parseHttpUrl } from "./safe-url";
import { normalizeDomain } from "./services";
import type { SiteRule } from "./site-rule";

/** Pages beyond this are not read (SPEC §7.11). */
export const MAX_SERIES_PAGE_LENGTH = 2 * 1024 * 1024;
const MAX_LINKS = 5000;
const HREF = /\bhref\s*=\s*(?:"([^"<>]{1,2048})"|'([^'<>]{1,2048})')/gi;
// Markers of interstitial bot checks; such a page is skipped, never worked around.
const CHALLENGE_MARKERS = [
  "/cdn-cgi/challenge-platform/",
  "cf_chl_opt",
  "cf-browser-verification",
  "<title>just a moment",
  "<title>attention required! | cloudflare",
  "ddos-guard",
  "captcha-delivery.com",
  "_incapsula_resource",
];
const CHALLENGE_SCAN_LENGTH = 32 * 1024;

/**
 * The newest chapter a series page links to (SPEC §7.11), read without a DOM: every `href` on the
 * same site is checked with the chapter detection (and the site rule) of the reader, and the
 * highest chapter of this series wins. Null when the page lists none, e.g. it loads them by script.
 */
export function latestChapterIn(html: string, pageUrl: string, externalKey: string, rule?: SiteRule): number | null {
  const page = parseHttpUrl(pageUrl);
  if (!page || html.length > MAX_SERIES_PAGE_LENGTH) return null;
  const site = normalizeDomain(page.hostname);

  let latest: number | null = null;
  let links = 0;
  for (const match of html.matchAll(HREF)) {
    if (++links > MAX_LINKS) break;
    const href = (match[1] ?? match[2] ?? "").replaceAll("&amp;", "&");
    let url: URL;
    try {
      url = new URL(href, page);
    } catch {
      continue;
    }
    if (!parseHttpUrl(url.href) || normalizeDomain(url.hostname) !== site) continue;
    const detection = detectChapterFromUrl(url, "", rule);
    if (detection?.seriesKey !== externalKey) continue;
    latest = latest === null ? detection.chapter : Math.max(latest, detection.chapter);
  }
  return latest;
}

/** True for an interstitial bot check (Cloudflare, DDoS-Guard, DataDome, Incapsula) instead of the page. */
export function looksLikeChallenge(html: string): boolean {
  const start = html.slice(0, CHALLENGE_SCAN_LENGTH).toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => start.includes(marker));
}
