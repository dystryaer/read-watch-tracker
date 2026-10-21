import { MAX_TEXT_LENGTH, parseWebnovelBookId, serviceKeyForUrl } from "@rwt/core";
import type { LibraryEntry } from "../lib/messages";

/** The two app libraries the extension reads (SPEC §7.6, §9): WebNovel in chapters, Kindle in percent. */
export type LibraryService = "webnovel" | "kindle";

export const MAX_LIBRARY_ENTRIES = 500;

// Synthetic layouts (A10): unverified until Spikes S2/S3 bring samples of the real pages.
const LIBRARY_PAGES: Record<LibraryService, (url: URL) => boolean> = {
  webnovel: (url) => url.pathname.startsWith("/library"),
  kindle: (url) => url.pathname.startsWith("/kindle-library"),
};

const CHAPTER = /(?<![\p{L}\d])(?:chapter|chap|ch\.?|kapitel|kap\.?)\s*(\d{1,5})(?!\d)/iu;
const PERCENT = /(?<![\d.,])(\d{1,3}(?:[.,]\d)?)\s*%/u;
const ASIN = /^[A-Z0-9]{10}$/;

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

/** A card's text with its parts kept apart: textContent would glue "Shadow Slave" and "Chapter 3" together. */
function cardText(card: Element): string {
  const parts: string[] = [];
  const walker = card.ownerDocument.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent ?? "");
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 2 * MAX_TEXT_LENGTH);
}

export function libraryServiceForUrl(url: URL): LibraryService | undefined {
  const key = serviceKeyForUrl(url.href);
  return key === "webnovel" || key === "kindle" ? key : undefined;
}

export function isLibraryPage(url: URL): boolean {
  const service = libraryServiceForUrl(url);
  return service !== undefined && LIBRARY_PAGES[service](url);
}

const BOOK_LINKS = "a[href*='/book/']";
const MAX_CARD_DEPTH = 6;

/**
 * A book's card: the largest ancestor of its link that holds no other book. Class names are not
 * trusted – a list wrapper such as "library-items" would otherwise count as the card of every book.
 */
function cardOf(link: Element, bookId: string, bookIds: Map<Element, string>): Element {
  let card: Element = link;
  for (let depth = 0; depth < MAX_CARD_DEPTH; depth++) {
    const parent = card.parentElement;
    if (!parent || parent === link.ownerDocument.body) break;
    // Also links that are no book here (another host): their card's text is not this book's.
    const others = [...parent.querySelectorAll(BOOK_LINKS)].some((other) => bookIds.get(other) !== bookId);
    if (others) break;
    card = parent;
  }
  return card;
}

function bookLinks(doc: Document, base: URL): Map<Element, string> {
  const ids = new Map<Element, string>();
  for (const link of doc.querySelectorAll(BOOK_LINKS)) {
    try {
      const bookId = parseWebnovelBookId(new URL(link.getAttribute("href") ?? "", base).href);
      if (bookId) ids.set(link, bookId);
    } catch {
      // Not a URL: not a book.
    }
  }
  return ids;
}

/** Every book link with the chapter its card names; a book without a readable chapter has no position to send. */
function webnovelEntries(doc: Document, base: URL): LibraryEntry[] {
  const entries = new Map<string, LibraryEntry>();
  const bookIds = bookLinks(doc, base);
  for (const [link, bookId] of bookIds) {
    if (entries.has(bookId)) continue;
    const href = new URL(link.getAttribute("href") ?? "", base).href;
    const chapter = CHAPTER.exec(cardText(cardOf(link, bookId, bookIds)))?.[1];
    const title = text(link.querySelector("h1, h2, h3, h4") ?? link);
    if (!chapter || title === "") continue;
    entries.set(bookId, { externalKey: bookId, title, chapter: Number(chapter), seriesUrl: href });
  }
  return [...entries.values()];
}

/** Every book tile with an ASIN and the percentage it shows (SPEC §9.2: "falls die Seite ihn anzeigt"). */
function kindleEntries(doc: Document): LibraryEntry[] {
  const entries = new Map<string, LibraryEntry>();
  for (const tile of doc.querySelectorAll("[data-asin]")) {
    const asin = (tile.getAttribute("data-asin") ?? "").toUpperCase();
    if (!ASIN.test(asin) || entries.has(asin)) continue;
    const percent = PERCENT.exec(cardText(tile))?.[1];
    const title = text(tile.querySelector(".title, [id^='title'], h2, h3, p"));
    // 0 % is a purchase not started yet: it would only open an inbox card.
    if (percent === undefined || Number(percent.replace(",", ".")) === 0 || title === "") continue;
    entries.set(asin, { externalKey: asin, title, percent: Math.min(100, Number(percent.replace(",", "."))), seriesUrl: null });
  }
  return [...entries.values()];
}

/** The books of a library page with their positions, or null when the page is none. */
export function readLibrary(doc: Document, url: URL): LibraryEntry[] | null {
  const service = libraryServiceForUrl(url);
  if (!service || !LIBRARY_PAGES[service](url)) return null;
  const entries = service === "webnovel" ? webnovelEntries(doc, url) : kindleEntries(doc);
  return entries.slice(0, MAX_LIBRARY_ENTRIES);
}
