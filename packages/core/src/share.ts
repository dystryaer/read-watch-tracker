import { parseHttpUrl } from "./safe-url";
import { normalizeDomain } from "./services";

/** What the iOS shortcut shared (SPEC §9.4): the app source and its key for the book. */
export interface SharedBook {
  source: "webnovel" | "kindle";
  /** WebNovel book id or Kindle ASIN (SPEC §5.2). */
  externalKey: string;
}

// Share sheets add text around the link; longer input is no share and is not searched.
const MAX_INPUT_LENGTH = 2000;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>„“”]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

const WEBNOVEL_HOSTS = new Set(["webnovel.com", "m.webnovel.com"]);
const BOOK_ID_IN_SEGMENT = /(?:^|_)(\d{8,20})$/;

const AMAZON_HOST = /^(?:read\.)?amazon\.(?:com|de|co\.uk|fr|it|es|nl|ca|com\.au|co\.jp|in|com\.br|com\.mx)$/;
const ASIN = /^[A-Z0-9]{10}$/;

function urlsIn(input: string): URL[] {
  if (input.length > MAX_INPUT_LENGTH) return [];
  return (input.match(URL_IN_TEXT) ?? []).flatMap((candidate) => parseHttpUrl(candidate.replace(TRAILING_PUNCTUATION, "")) ?? []);
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
