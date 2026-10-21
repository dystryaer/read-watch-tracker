import { comparePositions, MAX_TEXT_LENGTH, parseEpisode, streamingSeriesKey } from "@rwt/core";
import { LABEL_START, serviceForUrl, type StreamingServiceKey } from "./services";

/** One watched episode as a history page lists it (SPEC §7.6). */
export interface HistoryEntry {
  seriesTitle: string;
  season: number | null;
  episode: number;
}

export const MAX_HISTORY_ENTRIES = 500;

interface HistoryPage {
  isHistory(url: URL): boolean;
  /** Card selectors, most specific first; generic ones keep working when a site renames its classes. */
  cards: string[];
}

// Synthetic layouts (A10): unverified until samples of the real pages replace the fixtures.
// Disney+ has no known history page (SPEC §7.6, Spike S1).
const HISTORY_PAGES: Partial<Record<StreamingServiceKey, HistoryPage>> = {
  netflix: { isHistory: (url) => url.pathname.startsWith("/viewingactivity"), cards: ["li.retableRow", "li"] },
  primevideo: { isHistory: (url) => url.pathname.includes("/settings/watch-history"), cards: [".watch-history-item", "li"] },
  crunchyroll: {
    isHistory: (url) => url.hostname === "www.crunchyroll.com" && url.pathname.startsWith("/history"),
    cards: [".history-card", '[data-t="history-card"]', "article", "li"],
  },
};

// "21.10.26", "21. Oktober 2026", "vor 2 Tagen": dates are never the series title.
const DATE_LIKE = /^(?:[\d\s./,-]+|\d{1,2}\.\s*\p{L}+\.?\s*\d{4}|vor\s.*|.*\bago)$/iu;

function textsOf(card: Element): string[] {
  const texts: string[] = [];
  const walker = card.ownerDocument.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
    if (text !== "") texts.push(text);
  }
  return texts;
}

/**
 * Reads a card by content rather than by class names: the first text that names an episode is
 * the label, the first text before it that is no date is the series; "Dark: Staffel 2: Folge 5"
 * carries both in one text. Cards without an episode number (Netflix often lists only the
 * episode's title) are skipped.
 */
function entryOf(card: Element): HistoryEntry | null {
  const texts = textsOf(card);
  const labelIndex = texts.findIndex((text) => parseEpisode(text) !== null);
  const label = texts[labelIndex];
  const episode = label === undefined ? null : parseEpisode(label);
  if (!label || !episode) return null;

  const before = texts.slice(0, labelIndex).find((text) => !DATE_LIKE.test(text));
  const inLabel = label.split(LABEL_START)[0]?.replace(/[\s\-–—:|·,]+$/u, "") ?? "";
  const seriesTitle = before ?? inLabel;
  return seriesTitle === "" ? null : { seriesTitle, ...episode };
}

/** The entries of a service's history page, or null when the page is none. */
export function readHistory(doc: Document, url: URL): HistoryEntry[] | null {
  const service = serviceForUrl(url);
  const page = service ? HISTORY_PAGES[service.key] : undefined;
  if (!page?.isHistory(url)) return null;

  for (const selector of page.cards) {
    const entries = [...doc.querySelectorAll(selector)].flatMap((card) => entryOf(card) ?? []);
    if (entries.length > 0) return entries.slice(0, MAX_HISTORY_ENTRIES);
  }
  return [];
}

/** The furthest episode per series (by streaming key), in order of first appearance. */
export function latestPerSeries(entries: HistoryEntry[]): HistoryEntry[] {
  const latest = new Map<string, HistoryEntry>();
  for (const entry of entries) {
    const key = streamingSeriesKey(entry.seriesTitle) || entry.seriesTitle;
    const known = latest.get(key);
    const position = (item: HistoryEntry) => ({ unit: "episode" as const, season: item.season, episode: item.episode });
    if (!known || comparePositions(position(entry), position(known)) > 0) latest.set(key, entry);
  }
  return [...latest.values()];
}
