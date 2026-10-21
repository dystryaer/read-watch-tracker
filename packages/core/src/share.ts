import { cleanTextValue, MAX_TEXT_LENGTH } from "./event";
import { MAX_URL_LENGTH, parseHttpUrl } from "./safe-url";
import { normalizeDomain } from "./services";

/** What the iOS shortcut shared (SPEC §9.4): the app source and its key for the book. */
export interface SharedBook {
  source: "webnovel" | "kindle";
  /** WebNovel book id or Kindle ASIN (SPEC §5.2). */
  externalKey: string;
}

// Share sheets add text around the link; longer input is no share and is not searched. The same
// cap as ShareRequest's URL field, so every URL the API accepts is searched.
const MAX_INPUT_LENGTH = MAX_URL_LENGTH;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>„“”]+/gi;
const TRAILING_PUNCTUATION = new Set(".,;:!?)]");

const WEBNOVEL_HOSTS = new Set(["webnovel.com", "m.webnovel.com"]);
const BOOK_ID_IN_SEGMENT = /(?:^|_)(\d{8,20})$/;
const WEBNOVEL_BOOK_ID = /^\d{8,20}$/;

const AMAZON_HOST = /^(?:read\.)?amazon\.(?:com|de|co\.uk|fr|it|es|nl|ca|com\.au|co\.jp|in|com\.br|com\.mx)$/;
const ASIN = /^[A-Z0-9]{10}$/;

// A loop instead of a /[…]+$/ regex, which backtracks quadratically on long punctuation runs.
function withoutTrailingPunctuation(candidate: string): string {
  let end = candidate.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(candidate.charAt(end - 1))) end--;
  return candidate.slice(0, end);
}

function urlsIn(input: string): URL[] {
  if (input.length > MAX_INPUT_LENGTH) return [];
  return (input.match(URL_IN_TEXT) ?? []).flatMap((candidate) => parseHttpUrl(withoutTrailingPunctuation(candidate)) ?? []);
}

/** True for a key in the app's own format (SPEC §5.2): a WebNovel book id or a Kindle ASIN. */
export function isAppBookKey(source: SharedBook["source"], key: string): boolean {
  return source === "webnovel" ? WEBNOVEL_BOOK_ID.test(key) : ASIN.test(key);
}

/** The book id of a WebNovel book or chapter link (`/book/<slug>_<id>[/…]` or `/book/<id>`), also inside shared text. */
export function parseWebnovelBookId(input: string): string | null {
  for (const url of urlsIn(input)) {
    if (url.protocol !== "https:" || !WEBNOVEL_HOSTS.has(normalizeDomain(url.hostname))) continue;
    const [section, book] = url.pathname.split("/").filter(Boolean);
    const id = section === "book" && book ? BOOK_ID_IN_SEGMENT.exec(book)?.[1] : undefined;
    if (id) return id;
  }
  return null;
}

/** The ASIN of an Amazon product or Kindle link (`/dp/<ASIN>`, `/gp/product/<ASIN>`, `?asin=<ASIN>`), also inside shared text. */
export function parseAsin(input: string): string | null {
  for (const url of urlsIn(input)) {
    if (url.protocol !== "https:" || !AMAZON_HOST.test(normalizeDomain(url.hostname))) continue;
    const segments = url.pathname.split("/").filter(Boolean);
    const dp = segments.indexOf("dp");
    const candidates = [
      url.searchParams.get("asin"),
      dp >= 0 ? segments[dp + 1] : undefined,
      /(?:^|\/)gp\/(?:product|aw\/d)\/([^/]+)/.exec(segments.join("/"))?.[1],
    ];
    for (const candidate of candidates) {
      const asin = candidate?.toUpperCase();
      if (asin && ASIN.test(asin)) return asin;
    }
  }
  return null;
}

// Opening and closing quotation marks of German, English and French texts.
const QUOTED_TITLE = /[„“"«‚‘]([^„“”"«»‚‘’\n]{1,300})[“”"»‘’]/u;
const QUOTE_MARKS = /[„“”"«»‚‘’]/gu;
const TITLE_SEPARATORS = new Set(" :–—-|·");
const WEBNOVEL_SLUG = /^(.+)_\d{8,20}$/;

function trimSeparators(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && TITLE_SEPARATORS.has(value.charAt(start))) start++;
  while (end > start && TITLE_SEPARATORS.has(value.charAt(end - 1))) end--;
  return value.slice(start, end);
}

function asTitle(value: string): string | null {
  const title = trimSeparators(cleanTextValue(value)).slice(0, MAX_TEXT_LENGTH).trim();
  return title === "" ? null : title;
}

function titleFromSlug(slug: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null;
  }
  return /\p{L}/u.test(decoded) ? asTitle(decoded.replace(/[-_]+/g, " ")) : null;
}

/** "shadow-slave" in `/book/shadow-slave_<id>`, "Project-Hail-Mary" in `/Project-Hail-Mary/dp/<ASIN>`. */
function slugTitle(url: URL): string | null {
  const host = normalizeDomain(url.hostname);
  const segments = url.pathname.split("/").filter(Boolean);
  if (WEBNOVEL_HOSTS.has(host) && segments[0] === "book") {
    const slug = WEBNOVEL_SLUG.exec(segments[1] ?? "")?.[1];
    const title = slug ? titleFromSlug(slug) : null;
    return title?.replace(/(^|\s)(\p{Ll})/gu, (_match, space: string, letter: string) => space + letter.toUpperCase()) ?? null;
  }
  if (AMAZON_HOST.test(host)) {
    const dp = segments.indexOf("dp");
    const slug = dp > 0 ? segments[dp - 1] : undefined;
    return slug ? titleFromSlug(slug.replace(/-ebook$/i, "")) : null;
  }
  return null;
}

/**
 * The book's title in a share, for the inbox card of a book the tracker does not know yet: a
 * quoted title first (leaves the author out), then the link's slug, then the text around the link.
 */
export function sharedTitle(input: { url?: string; text?: string }): string | null {
  const text = input.text !== undefined && input.text.length <= MAX_INPUT_LENGTH ? cleanTextValue(input.text) : "";
  const quoted = QUOTED_TITLE.exec(text)?.[1];
  if (quoted) {
    const title = asTitle(quoted);
    if (title) return title;
  }
  for (const url of [...urlsIn(input.url ?? ""), ...urlsIn(text)]) {
    const title = slugTitle(url);
    if (title) return title;
  }
  return asTitle(text.replace(URL_IN_TEXT, " ").replace(QUOTE_MARKS, ""));
}

/** The book behind a share from the WebNovel or Kindle app: the URL first, then the text. */
export function parseShare(input: { url?: string; text?: string }): SharedBook | null {
  for (const value of [input.url, input.text]) {
    if (!value) continue;
    const bookId = parseWebnovelBookId(value);
    if (bookId) return { source: "webnovel", externalKey: bookId };
    const asin = parseAsin(value);
    if (asin) return { source: "kindle", externalKey: asin };
  }
  return null;
}
