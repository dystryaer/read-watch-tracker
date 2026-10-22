import { detectChapterFromUrl, detectChapterLink } from "./detect-url";
import { parseHttpUrl } from "./safe-url";
import { normalizeDomain } from "./services";
import type { SiteRule } from "./site-rule";

/** Pages beyond this are not read (SPEC §7.11). */
export const MAX_SERIES_PAGE_LENGTH = 2 * 1024 * 1024;
// Bounds the URL parsing; long chapter lists (2000 chapters × several links each) still fit.
const MAX_LINKS = 50_000;
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

/** Detection runs at most this long per page: a slow site rule must not stall the extension. */
const DEFAULT_BUDGET_MS = 1000;
const MAX_CANDIDATE_PATH_LENGTH = 512;
const HAS_DIGIT = /\d/;

/**
 * The newest chapter a series page links to (SPEC §7.11), read without a DOM: every `href` on the
 * same site is checked with the chapter detection (and the site rule) of the reader, and the
 * highest chapter of this series wins. Null when the page lists none, e.g. it loads them by script.
 * Links that name no series (`?manga=6&chapter=12`) count through the rule's chapter link pattern;
 * of those, only the most common link form – the series' own list – counts, never a sidebar.
 * Each link is checked once, links without a number are skipped, and after the time budget the
 * highest chapter found so far is returned.
 */
export function latestChapterIn(
  html: string,
  pageUrl: string,
  externalKey: string,
  rule?: SiteRule,
  { budgetMs = DEFAULT_BUDGET_MS, now = Date.now }: { budgetMs?: number; now?: () => number } = {},
): number | null {
  const page = parseHttpUrl(pageUrl);
  if (!page || html.length > MAX_SERIES_PAGE_LENGTH) return null;
  const site = normalizeDomain(page.hostname);
  const deadline = now() + budgetMs;

  let latest: number | null = null;
  /** Links found only by the chapter link pattern, by link form: how many, and their highest chapter. */
  const forms = new Map<string, { links: number; latest: number }>();
  let links = 0;
  const seen = new Set<string>();
  for (const match of html.matchAll(HREF)) {
    if (++links > MAX_LINKS) break;
    const href = (match[1] ?? match[2] ?? "").replaceAll("&amp;", "&");
    if (!HAS_DIGIT.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, page);
    } catch {
      continue;
    }
    const path = url.pathname + url.search;
    if (path.length > MAX_CANDIDATE_PATH_LENGTH || seen.has(path)) continue;
    seen.add(path);
    if (!parseHttpUrl(url.href) || normalizeDomain(url.hostname) !== site) continue;
    if (now() > deadline) break;
    const detection = detectChapterFromUrl(url, "", rule);
    if (detection?.seriesKey === externalKey) {
      latest = latest === null ? detection.chapter : Math.max(latest, detection.chapter);
      continue;
    }
    const link = detection ? null : detectChapterLink(url, rule);
    if (link) {
      const form = forms.get(link.form);
      forms.set(link.form, { links: (form?.links ?? 0) + 1, latest: Math.max(form?.latest ?? 0, link.chapter) });
    }
  }
  const listed = mostCommon([...forms.values()]);
  return listed === null ? latest : Math.max(latest ?? 0, listed.latest);
}

/** The link form with the most links; null when there is none or two are equally common. */
function mostCommon(forms: { links: number; latest: number }[]): { links: number; latest: number } | null {
  const [first, second] = forms.toSorted((a, b) => b.links - a.links);
  return first && first.links !== second?.links ? first : null;
}

/** True for an interstitial bot check (Cloudflare, DDoS-Guard, DataDome, Incapsula) instead of the page. */
export function looksLikeChallenge(html: string): boolean {
  const start = html.slice(0, CHALLENGE_SCAN_LENGTH).toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => start.includes(marker));
}
